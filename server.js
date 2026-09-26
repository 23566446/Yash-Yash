const express = require('express');
const http = require('http');
const crypto = require('crypto');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { Server } = require('socket.io');
const itineraryXlsx = require('./lib/itinerary-xlsx');
const { shouldNotifyProposalPending } = require('./lib/notification-utils');
const { buildTripContext } = require('./lib/ai-context');
const { validateQuestion, createRateWindow } = require('./lib/ai-utils');
const aiProvider = require('./lib/ai-provider');
const { tokenVersionOf, isTokenVersionCurrent, sessionMetadata } = require('./lib/session-utils');
require('dotenv').config();

const app = express();
const httpServer = http.createServer(app);
const TRUSTED_ORIGINS = ['https://23566446.github.io', 'http://127.0.0.1:5500', 'http://localhost:5500'];
const io = new Server(httpServer, {
    cors: { origin: TRUSTED_ORIGINS, methods: ['GET', 'POST'] }
});

// 中間件：調高限制以支持大頭照
app.use(cors({
    origin: TRUSTED_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const MONGO_URI =  process.env.MONGO_URI;

mongoose.connect(MONGO_URI).then(() => console.log("✅ 成功連上 MongoDB!"));

// 資料模型
const User = mongoose.model('User', new mongoose.Schema({
    account: { type: String, required: true, unique: true },
    password: { type: String, required: true, select: false },
    nickname: String,
    gender: String,
    role: { type: String, default: 'user' },
    avatar: { type: String, default: "" },
    tokenVersion: { type: Number, default: 0 }
}));

const JWT_SECRET = process.env.JWT_SECRET;
const BCRYPT_ROUNDS = 12;
const aiRateWindow = createRateWindow();
const RASTER_DATA_URL = /^data:image\/(jpeg|png|webp|gif|heic|heif|avif);base64,[A-Za-z0-9+/=\s]+$/i;
function validImageData(value, maxLength) { return typeof value === 'string' && value.length <= maxLength && RASTER_DATA_URL.test(value); }

function toPublicUser(user) {
    return {
        _id: user._id,
        account: user.account,
        nickname: user.nickname,
        gender: user.gender,
        role: user.role,
        avatar: user.avatar || ''
    };
}

function createToken(user) {
    if (!JWT_SECRET) throw new Error('JWT_SECRET is not configured');
    return jwt.sign({ sub: user._id.toString(), account: user.account, role: user.role, ver: tokenVersionOf(user.tokenVersion) }, JWT_SECRET, { expiresIn: '7d' });
}

async function authenticateToken(req, res, next) {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token) return res.status(401).json({ message: '需要登入驗證' });
    if (!JWT_SECRET) return res.status(500).json({ message: '伺服器驗證設定未完成' });

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(payload.sub);
        if (!user || !isTokenVersionCurrent(payload, user)) return res.status(401).json({ message: '驗證已失效，請重新登入' });
        req.user = user;
        req.authPayload = payload;
        next();
    } catch (error) {
        return res.status(401).json({ message: '驗證已失效，請重新登入' });
    }
}

function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: '需要管理員權限' });
    next();
}

function isTripParticipant(trip, user) {
    return trip.participants.includes(user.account);
}

async function getProposalCreatorAccount(proposal) {
    if (proposal.creatorAccount) return proposal.creatorAccount;
    const account = proposal.votes?.[0];
    if (account) { proposal.creatorAccount = account; await proposal.save(); }
    return account;
}

async function getTripCreatorAccount(trip) {
    if (trip.creatorAccount) return trip.creatorAccount;
    const account = trip.participants?.[0];
    if (account) { trip.creatorAccount = account; await trip.save(); }
    return account;
}

async function isTripCreatorOrAdmin(trip, user) {
    return user.role === 'admin' || await getTripCreatorAccount(trip) === user.account;
}

async function getAuthorizedTrip(req, res, creatorOnly = false, participantOnly = true) {
    let trip;
    try { trip = await Trip.findById(req.params.id); } catch (error) { return res.status(404).json({ message: '找不到該行程' }), null; }
    if (!trip) return res.status(404).json({ message: '找不到該行程' }), null;
    const allowed = creatorOnly ? await isTripCreatorOrAdmin(trip, req.user) : participantOnly ? isTripParticipant(trip, req.user) : isTripParticipant(trip, req.user) || await isTripCreatorOrAdmin(trip, req.user);
    if (!allowed) return res.status(403).json({ message: '你沒有權限存取這個內容' }), null;
    return trip;
}

const Proposal = mongoose.model('Proposal', new mongoose.Schema({
    creator: String,
    creatorAccount: String,
    start: String,
    end: String,
    min: Number,
    votes: [String],
    status: { type: String, default: 'voting' }
}));

const Trip = mongoose.model('Trip', new mongoose.Schema({
    title: String,
    startDate: String,
    endDate: String,
    participants: [String],
    creator: String,
    creatorAccount: String,
    days: [{
        dayNumber: Number,
        locations: [{ name: String, addr: String, mapUrl: String, lat: Number, lng: Number, note: String, time: String }]
    }],
    chatMessages: Array
}));

const License = mongoose.model('License', new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    limit: { type: Number, required: true },
    used: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
}));

const Setting = mongoose.model('Setting', new mongoose.Schema({
    key: String,
    value: String
}));

const ExpenseSchema = new mongoose.Schema({
    tripId: String,
    payer: String,
    payerName: String,
    amount: Number,
    currency: String,
    category: String,
    note: String,
    splitWith: [String],
    createdAt: { type: Date, default: Date.now }
});
ExpenseSchema.index({ tripId: 1, createdAt: -1 });
const Expense = mongoose.model('Expense', ExpenseSchema);

const PhotoSchema = new mongoose.Schema({
    tripId: String,
    uploader: String,
    uploaderAccount: String,
    imageData: String,
    dayIndex: Number,
    order: Number,
    createdAt: { type: Date, default: Date.now }
});
PhotoSchema.index({ tripId: 1, dayIndex: 1, order: 1 });
const Photo = mongoose.model('Photo', PhotoSchema);

// ========== API 路由 ==========

// Lightweight readiness endpoint used by the login page to wake Render.
app.get('/api/health', (req, res) => {
    const database = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    res.status(database === 'connected' ? 200 : 503).json({
        status: database === 'connected' ? 'ok' : 'unavailable',
        database
    });
});

// [註冊]
app.post('/api/register', async (req, res) => {
    try {
        const { account, password, nickname, gender, licenseKey } = req.body;
        if (!JWT_SECRET) return res.status(500).json({ message: '伺服器驗證設定未完成' });
        if (!account || !password || typeof nickname !== 'string' || !nickname.trim() || nickname.length > 50) return res.status(400).json({ message: '帳號、密碼與暱稱為必填' });
        const license = await License.findOne({ key: licenseKey?.trim() });
        if (!license || license.used >= license.limit) return res.status(403).json({ message: "金鑰無效或已達使用上限" });

        const existingUser = await User.findOne({ account });
        if (existingUser) return res.status(400).json({ message: "帳號已存在" });

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const newUser = new User({ account, password: passwordHash, nickname, gender, role: 'user' });
        await newUser.save();

        license.used += 1;
        await license.save();

        res.status(201).json({ message: "註冊成功", user: toPublicUser(newUser), token: createToken(newUser) });
    } catch (error) { res.status(500).json({ message: "伺服器錯誤" }); }
});

// [登入]
app.post('/api/login', async (req, res) => {
    try {
        const { account, password } = req.body;
        if (!JWT_SECRET) return res.status(500).json({ message: '伺服器驗證設定未完成' });
        const user = await User.findOne({ account }).select('+password');
        if (!user) return res.status(401).json({ message: "帳號或密碼錯誤" });

        const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(user.password);
        const passwordMatches = isBcryptHash
            ? await bcrypt.compare(password || '', user.password)
            : password === user.password;
        if (!passwordMatches) return res.status(401).json({ message: "帳號或密碼錯誤" });

        if (!isBcryptHash) {
            user.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
            await user.save();
        }
        res.json({ message: "登入成功", user: toPublicUser(user), token: createToken(user) });
    } catch (error) { res.status(500).json({ message: "伺服器錯誤" }); }
});

// [變更角色權限]
app.put('/api/admin/change-role', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { targetUserId, newRole } = req.body;
        const target = await User.findById(targetUserId);
        if (!target) return res.status(404).json({ message: "找不到使用者" });
        if (target.account === 'admin') return res.status(403).json({ message: "不可更動超級管理員權限" });
        if (!['user', 'admin'].includes(newRole)) return res.status(400).json({ message: "權限資料不合法" });
        const updatedUser = await User.findByIdAndUpdate(targetUserId, { role: newRole }, { new: true });
        res.json({ message: "權限更新成功", user: toPublicUser(updatedUser) });
    } catch (e) { res.status(500).json({ message: "更新失敗" }); }
});

// [更新個人資料]
app.put('/api/users/update', authenticateToken, async (req, res) => {
    try {
        const { nickname, password, gender, avatar } = req.body;
        if (typeof nickname !== 'string' || !nickname.trim() || nickname.length > 50 || (avatar !== undefined && avatar !== '' && !validImageData(avatar, 7 * 1024 * 1024))) return res.status(400).json({ message: '個人資料不合法' });
        let updateData = { nickname, gender, avatar };
        let passwordChanged = false;
        if (password && password.trim() !== "") {
            updateData.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
            passwordChanged = true; 
        }
        const update = { $set: updateData };
        if (passwordChanged) update.$inc = { tokenVersion: 1 };
        const user = await User.findByIdAndUpdate(req.user._id, update, { new: true });
        if (passwordChanged) {
            io.to(`user:${user.account}`).emit('session:revoked');
            io.in(`user:${user.account}`).disconnectSockets(true);
        }
        res.json({ message: "更新成功", user: toPublicUser(user), logoutRequired: passwordChanged });
    } catch (error) { res.status(500).json({ message: "更新失敗" }); }
});

// [公開] 依帳號批次取得使用者公開資料（暱稱/頭像）
// GET /api/users/by-accounts?accounts=a,b,c
app.get('/api/users/by-accounts', async (req, res) => {
    try {
        const raw = (req.query.accounts || "").toString();
        const accounts = raw.split(',').map(s => s.trim()).filter(Boolean);
        if (accounts.length === 0) return res.json([]);

        const users = await User.find(
            { account: { $in: accounts } },
            { account: 1, nickname: 1, avatar: 1, _id: 0 }
        );
        const map = new Map(users.map(u => [u.account, u]));

        // 依照輸入順序回傳，缺資料的用 fallback
        res.json(accounts.map(acc => {
            const u = map.get(acc);
            if (!u) return { account: acc, nickname: acc, avatar: "" };
            return { account: u.account, nickname: u.nickname || u.account, avatar: u.avatar || "" };
        }));
    } catch (e) {
        res.status(500).json({ message: "讀取使用者資料失敗" });
    }
});

// [管理員 API：獲取使用者、金鑰、重設密碼、刪除]
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        res.json((await User.find()).map(toPublicUser));
    } catch (error) { res.status(500).json({ message: '讀取使用者失敗' }); }
});

app.get('/api/session', authenticateToken, (req, res) => {
    res.json({ ...toPublicUser(req.user), session: sessionMetadata(req.authPayload) });
});

app.post('/api/session/logout-all', authenticateToken, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, { $inc: { tokenVersion: 1 } });
        io.to(`user:${req.user.account}`).emit('session:revoked');
        io.in(`user:${req.user.account}`).disconnectSockets(true);
        res.json({ message: '已登出所有裝置' });
    } catch (error) {
        res.status(500).json({ message: '無法登出所有裝置' });
    }
});

app.get('/api/home-bootstrap', authenticateToken, async (req, res) => {
    try {
        const [marquee, rawProposals, trips] = await Promise.all([
            Setting.findOne({ key: 'marquee' }, { value: 1, _id: 0 }).lean(),
            Proposal.find({}, { creator: 1, creatorAccount: 1, start: 1, end: 1, min: 1, votes: 1, status: 1 }).lean(),
            Trip.find(
                { participants: req.user.account },
                { title: 1, startDate: 1, endDate: 1, participants: 1, creator: 1, creatorAccount: 1 }
            ).lean()
        ]);

        const proposals = rawProposals.map(proposal => ({
            ...proposal,
            creatorAccount: proposal.creatorAccount || proposal.votes?.[0] || ''
        }));
        const notifications = proposals.filter(proposal => proposal.status === 'pending' && proposal.creatorAccount === req.user.account);

        res.json({
            user: { ...toPublicUser(req.user), session: sessionMetadata(req.authPayload) },
            home: {
                marqueeText: marquee?.value || '歡迎來到 YashYash，祝您旅途愉快！',
                proposals,
                trips,
                notifications
            }
        });
    } catch (error) {
        console.error('Home bootstrap failed');
        res.status(500).json({ message: '首頁資料載入失敗' });
    }
});
app.get('/api/admin/licenses', authenticateToken, requireAdmin, async (req, res) => {
    try {
        res.json(await License.find().sort({ createdAt: -1 }));
    } catch (error) { res.status(500).json({ message: '讀取金鑰失敗' }); }
});
app.post('/api/admin/licenses', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.body.limit, 10);
        if (!Number.isInteger(limit) || limit < 1) return res.status(400).json({ message: '使用次數不合法' });
        const key = "YASH-" + Math.random().toString(36).substring(2, 6).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
        const newL = new License({ key, limit });
        await newL.save();
        res.json(newL);
    } catch (error) { res.status(500).json({ message: '建立金鑰失敗' }); }
});
app.delete('/api/admin/licenses/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await License.findByIdAndDelete(req.params.id);
        if (!result) return res.status(404).json({ message: "找不到該金鑰" });
        res.json({ message: "金鑰已刪除" });
    } catch (e) { res.status(500).json({ message: "伺服器刪除出錯" }); }
});
app.put('/api/admin/reset-password', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { targetUserId, newPassword } = req.body;
        if (!targetUserId || !mongoose.isValidObjectId(targetUserId)) return res.status(400).json({ message: '使用者資料不合法' });
        if (typeof newPassword !== 'string' || newPassword.length === 0) return res.status(400).json({ message: '密碼不能為空' });
        const target = await User.findById(targetUserId);
        if (!target) return res.status(404).json({ message: '找不到使用者' });
        await User.findByIdAndUpdate(targetUserId, { $set: { password: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) }, $inc: { tokenVersion: 1 } });
        io.to(`user:${target.account}`).emit('session:revoked');
        io.in(`user:${target.account}`).disconnectSockets(true);
        res.json({ message: "密碼重設成功" });
    } catch (error) { res.status(500).json({ message: '密碼重設失敗' }); }
});
app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const target = await User.findById(req.params.id);
        if (!target) return res.status(404).json({ message: '找不到使用者' });
        if (target.account === 'admin') return res.status(403).json({ message: "不可刪除管理員" });
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: "已移除使用者" });
    } catch (error) { res.status(500).json({ message: '刪除使用者失敗' }); }
});

// [公告欄與行程 API]
app.get('/api/proposals', authenticateToken, async (req, res) => {
    const proposals = await Proposal.find();
    for (const proposal of proposals) await getProposalCreatorAccount(proposal);
    res.json(proposals);
});
app.post('/api/proposals', authenticateToken, async (req, res) => {
    if (!req.body.start || !req.body.end || Number.isNaN(Date.parse(req.body.start)) || Number.isNaN(Date.parse(req.body.end)) || new Date(req.body.end) < new Date(req.body.start) || !Number.isInteger(req.body.min) || req.body.min < 1) return res.status(400).json({ message: "提案資料不合法" });
    const newP = new Proposal({ start: req.body.start, end: req.body.end, min: req.body.min, creator: req.user.nickname || req.user.account, creatorAccount: req.user.account, votes: [req.user.account], status: 'voting' });
    await newP.save(); 
    res.status(201).json(newP);
});

app.put('/api/proposals/:id', authenticateToken, async (req, res) => {
    try {
        const { start, end, min } = req.body;
        const prop = await Proposal.findById(req.params.id);
        if (!prop) return res.status(404).json({ message: "找不到該提案" });
        if (req.user.role !== 'admin' && await getProposalCreatorAccount(prop) !== req.user.account) return res.status(403).json({ message: '你沒有權限存取這個內容' });

        if (start) prop.start = start;
        if (end) prop.end = end;
        if (min !== undefined) prop.min = parseInt(min);

        if (prop.votes.length >= prop.min) {
            prop.status = 'pending';
        } else {
            prop.status = 'voting';
        }

        await prop.save();
        res.json(prop);
    } catch (error) {
        console.error("更新提案失敗:", error);
        res.status(500).json({ message: "修改失敗" });
    }
});

app.delete('/api/proposals/:id', authenticateToken, async (req, res) => {
    const prop = await Proposal.findById(req.params.id);
    if (!prop) return res.status(404).json({ message: '找不到提案' });
    if (req.user.role !== 'admin' && await getProposalCreatorAccount(prop) !== req.user.account) return res.status(403).json({ message: '你沒有權限存取這個內容' });
    await prop.deleteOne();
    res.json({ message: "OK" });
});

app.post('/api/proposals/vote', authenticateToken, async (req, res) => {
    const { proposalId } = req.body;
    const prop = await Proposal.findById(proposalId);
    if (!prop) return res.status(404).json({ message: '找不到提案' });
    if (!prop.votes.includes(req.user.account)) {
        const previousStatus = prop.status;
        prop.votes.push(req.user.account);
        if (prop.votes.length >= prop.min) {
            prop.status = 'pending'; 
        }
        await prop.save();
        if (shouldNotifyProposalPending(previousStatus, prop.status)) {
            const creatorAccount = await getProposalCreatorAccount(prop);
            if (creatorAccount) io.to(`user:${creatorAccount}`).emit('notification:proposal-pending', { proposalId: prop._id.toString() });
        }
        res.json({ message: "投票成功", status: prop.status });
    } else {
        res.status(400).json({ message: "已投過票" });
    }
});

app.post('/api/trips/confirm', authenticateToken, async (req, res) => {
    try {
        const { proposalId, action, title } = req.body;
        const prop = await Proposal.findById(proposalId);
        if (!prop) return res.status(404).json({ message: "找不到提案" });
        if (req.user.role !== 'admin' && await getProposalCreatorAccount(prop) !== req.user.account) return res.status(403).json({ message: '你沒有權限存取這個內容' });

        if (action === 'confirm') {
            if (typeof title !== 'string' || !title.trim() || title.length > 100) return res.status(400).json({ message: '行程名稱不合法' });
            const today = new Date().toISOString().split('T')[0];
            const exist = await Trip.findOne({ title, endDate: { $gte: today } });
            if (exist) return res.status(400).json({ message: `名稱「${title}」已被使用，請換一個名字。` });

            const start = new Date(prop.start);
            const end = new Date(prop.end);
            const diff = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;

            const t = new Trip({
                title,
                startDate: prop.start,
                endDate: prop.end,
                participants: prop.votes,
                creator: prop.creator,
                creatorAccount: await getProposalCreatorAccount(prop),
                days: Array.from({ length: diff }, (_, i) => ({ dayNumber: i + 1, locations: [] }))
            });
            await t.save();
        }
        await Proposal.findByIdAndDelete(proposalId);
        res.json({ message: "OK" });
    } catch (e) { res.status(500).json({ message: "建立失敗" }); }
});

app.get('/api/my-trips', authenticateToken, async (req, res) => {
    try {
        const trips = await Trip.find(
            { participants: req.user.account },
            { title: 1, startDate: 1, endDate: 1, participants: 1, creator: 1, creatorAccount: 1 }
        ).lean();
        res.json(trips);
    } catch (e) { res.status(500).send("讀取失敗"); }
});

app.get('/api/trips/:id', authenticateToken, async (req, res) => {
    const trip = await getAuthorizedTrip(req, res, false, false);
    if (trip) { await getTripCreatorAccount(trip); res.json(trip); }
});

const itineraryUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 4, parts: 5 },
    fileFilter: (req, file, done) => done(null, /\.xlsx$/i.test(file.originalname) && !/\.(xls|xlsm)$/i.test(file.originalname))
}).single('file');

function receiveItinerary(req, res, next) {
    itineraryUpload(req, res, error => {
        if (error) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message: 'XLSX 超過 2 MB 或上傳格式不合法' });
        if (!req.file) return res.status(400).json({ message: '請選擇 .xlsx 檔案' });
        next();
    });
}

function sendWorkbook(res, workbook, filename) {
    return workbook.xlsx.writeBuffer().then(buffer => {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        const asciiFilename = filename.replace(/[^\x20-\x7e]/g, '_');
        res.setHeader('Content-Disposition', `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
        res.send(Buffer.from(buffer));
    });
}

app.get('/api/trips/:id/itinerary/template.xlsx', authenticateToken, async (req, res) => {
    try {
        const trip = await getAuthorizedTrip(req, res);
        if (!trip) return;
        await sendWorkbook(res, itineraryXlsx.buildWorkbook(trip, false), 'YashYash_Itinerary_Template.xlsx');
    } catch { res.status(500).json({ message: '範本產生失敗' }); }
});

app.get('/api/trips/:id/itinerary/export.xlsx', authenticateToken, async (req, res) => {
    try {
        const trip = await getAuthorizedTrip(req, res);
        if (!trip) return;
        await sendWorkbook(res, itineraryXlsx.buildWorkbook(trip), itineraryXlsx.safeFilename(trip.title));
    } catch { res.status(500).json({ message: '匯出失敗' }); }
});

app.post('/api/trips/:id/itinerary/import/preview', authenticateToken, receiveItinerary, async (req, res) => {
    try {
        const trip = await getAuthorizedTrip(req, res);
        if (!trip) return;
        const rows = await itineraryXlsx.parseWorkbook(req.file.buffer, trip);
        res.json({ rows, summary: {
            total: rows.length,
            resolved: rows.filter(row => !row.errors.length && row.lat != null).length,
            unresolved: rows.filter(row => !row.errors.length && row.lat == null).length,
            warnings: rows.reduce((total, row) => total + row.warnings.length, 0),
            errors: rows.reduce((total, row) => total + row.errors.length, 0)
        }, existingCount: trip.days.reduce((total, day) => total + day.locations.length, 0) });
    } catch (error) { res.status(400).json({ message: error.message }); }
});

app.post('/api/trips/:id/itinerary/import', authenticateToken, receiveItinerary, async (req, res) => {
    try {
        const trip = await getAuthorizedTrip(req, res);
        if (!trip) return;
        const rows = await itineraryXlsx.parseWorkbook(req.file.buffer, trip);
        if (!rows.length) return res.status(400).json({ message: '檔案沒有可匯入的地點' });
        if (rows.some(row => row.errors.length)) return res.status(400).json({ message: '檔案仍有欄位錯誤' });
        if (rows.some(row => row.warnings.length) && req.body.acknowledgeWarnings !== 'true') return res.status(400).json({ message: '請先確認匯入警告' });
        let decisions;
        try { decisions = JSON.parse(req.body.decisions || '{}'); } catch { return res.status(400).json({ message: '地點確認資料不合法' }); }
        if (!decisions || typeof decisions !== 'object' || Array.isArray(decisions) || Object.keys(decisions).length > rows.length) return res.status(400).json({ message: '地點確認資料不合法' });
        const mode = req.body.mode;
        const days = itineraryXlsx.applyImport(
            { days: trip.days.map(day => day.toObject()) },
            rows, mode, decisions
        );
        if (mode === 'replace' && req.body.confirmReplace !== 'true') return res.status(400).json({ message: '請確認取代現有行程' });
        const updated = await Trip.findOneAndUpdate(
            { _id: trip._id, __v: trip.__v, participants: req.user.account },
            { $set: { days }, $inc: { __v: 1 } },
            { new: true, runValidators: true }
        );
        if (!updated) return res.status(409).json({ message: '行程已被其他人修改，請重新預覽' });
        res.json(updated);
    } catch (error) { res.status(400).json({ message: error.message }); }
});

app.post('/api/trips/:id/location', authenticateToken, async (req, res) => {
    try {
        const t = await getAuthorizedTrip(req, res);
        if (!t) return;
        if (!Number.isInteger(req.body.dayIndex) || !t.days[req.body.dayIndex]) return res.status(400).json({ message: '日期資料不合法' });
        const l = req.body.location;
        if (!l || typeof l.name !== 'string' || !l.name.trim() || l.name.length > 200 || typeof l.addr !== 'string' || l.addr.length > 500 || !Number.isFinite(l.lat) || !Number.isFinite(l.lng) || l.lat < -90 || l.lat > 90 || l.lng < -180 || l.lng > 180) return res.status(400).json({ message: '地點資料不合法' });
        t.days[req.body.dayIndex].locations.push({ name: l.name, addr: l.addr, lat: l.lat, lng: l.lng, note: typeof l.note === 'string' ? l.note.slice(0, 500) : '', time: typeof l.time === 'string' ? l.time.slice(0, 50) : '' });
        await t.save();
        res.json(t);
    } catch (e) { res.status(500).json({ message: "新增地點失敗" }); }
});

app.post('/api/trips/:id/location/delete', authenticateToken, async (req, res) => {
    try {
        const t = await getAuthorizedTrip(req, res);
        if (!t) return;
        if (!Number.isInteger(req.body.dayIndex) || !Number.isInteger(req.body.locationIndex) || !t.days[req.body.dayIndex]?.locations[req.body.locationIndex]) return res.status(400).json({ message: '景點資料不合法' });
        t.days[req.body.dayIndex].locations.splice(req.body.locationIndex, 1);
        await t.save();
        res.json(t);
    } catch (e) { res.status(500).json({ message: "刪除地點失敗" }); }
});

app.post('/api/trips/:id/location/reorder', authenticateToken, async (req, res) => {
    try {
        const { dayIndex, oldIndex, newIndex } = req.body;
        if (![dayIndex, oldIndex, newIndex].every(Number.isInteger) || dayIndex < 0 || oldIndex < 0 || newIndex < 0) {
            return res.status(400).json({ message: "排序資料不合法" });
        }

        const trip = await getAuthorizedTrip(req, res);
        if (!trip) return;
        const locations = trip.days?.[dayIndex]?.locations;
        if (!Array.isArray(locations) || oldIndex >= locations.length || newIndex >= locations.length) {
            return res.status(400).json({ message: "排序索引不合法" });
        }

        const [location] = locations.splice(oldIndex, 1);
        locations.splice(newIndex, 0, location);
        await trip.save();
        res.json({ message: "景點排序已更新", trip });
    } catch (error) {
        console.error('Location reorder failed:', error);
        res.status(500).json({ message: "更新景點排序失敗" });
    }
});

// ========== 【新增】修改行程日期 API ==========
app.put('/api/trips/:id/dates', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.body;
        
        console.log(`📅 收到日期修改請求 - Trip ID: ${req.params.id}`);
        console.log(`新開始日期: ${startDate}`);
        console.log(`新結束日期: ${endDate}`);
        
        if (!startDate || !endDate) {
            return res.status(400).json({ message: "開始日期和結束日期都必填" });
        }
        
        const trip = await getAuthorizedTrip(req, res, true);
        if (!trip) return;
        // 計算新的天數
        const start = new Date(startDate);
        const end = new Date(endDate);
        const newDayCount = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;
        
        console.log(`原本天數: ${trip.days.length}, 新天數: ${newDayCount}`);
        
        // 更新日期
        trip.startDate = startDate;
        trip.endDate = endDate;
        
        // 調整天數陣列
        if (newDayCount > trip.days.length) {
            // 天數增加：補充新的空白天
            for (let i = trip.days.length + 1; i <= newDayCount; i++) {
                trip.days.push({ dayNumber: i, locations: [] });
            }
            console.log(`✅ 新增了 ${newDayCount - trip.days.length} 天`);
        } else if (newDayCount < trip.days.length) {
            // 天數減少：保留前 N 天
            trip.days = trip.days.slice(0, newDayCount);
            console.log(`✅ 移除了多餘的 ${trip.days.length - newDayCount} 天`);
        } else {
            console.log(`✅ 天數不變，僅更新日期`);
        }
        
        await trip.save();
        
        console.log(`✅ 日期修改成功 - 新天數: ${trip.days.length}`);
        res.json({ 
            message: "日期更新成功", 
            trip: trip 
        });
        
    } catch (error) {
        console.error("❌ 修改日期失敗:", error);
        res.status(500).json({ message: "修改日期失敗", error: error.message });
    }
});

app.delete('/api/trips/:id', authenticateToken, async (req, res) => {
    try {
        const trip = await getAuthorizedTrip(req, res, true);
        if (!trip) return;
        await Trip.findByIdAndDelete(req.params.id);
        res.json({ message: "OK" });
    } catch (e) { res.status(500).json({ message: "刪除失敗" }); }
});

app.get('/api/notifications', authenticateToken, async (req, res) => {
    const proposals = await Proposal.find({ status: 'pending' });
    const mine = [];
    for (const proposal of proposals) if (await getProposalCreatorAccount(proposal) === req.user.account) mine.push(proposal);
    res.json(mine);
});

// [聊天室 API]
app.get('/api/trips/:id/chat', authenticateToken, async (req, res) => {
    try {
        const trip = await getAuthorizedTrip(req, res);
        if (!trip) return;
        res.json(trip.chatMessages || []);
    } catch (e) { res.status(500).send("讀取聊天紀錄失敗"); }
});

app.post('/api/trips/:id/chat', authenticateToken, async (req, res) => {
    try {
        const trip = await getAuthorizedTrip(req, res);
        if (!trip) return;
        if (typeof req.body.text !== 'string' || !req.body.text.trim() || req.body.text.length > 500) return res.status(400).json({ message: '訊息資料不合法' });
        const newMessage = { messageId: crypto.randomUUID(), sender: req.user.nickname || req.user.account, senderAccount: req.user.account, text: req.body.text, avatar: req.user.avatar || '', time: new Date() };
        trip.chatMessages.push(newMessage);
        await trip.save();
        io.to(`trip:${trip._id}`).emit('trip:message', newMessage);
        res.status(201).json(newMessage);
    } catch (e) { res.status(500).send("傳送失敗"); }
});

// [支出記帳 API]
app.get('/api/trips/:id/expenses', authenticateToken, async (req, res) => {
    try {
        if (!await getAuthorizedTrip(req, res)) return;
        const expenses = await Expense.find({ tripId: req.params.id }).sort({ createdAt: -1 });
        res.json(expenses);
    } catch (e) { res.status(500).send("讀取失敗"); }
});

app.post('/api/trips/:id/expenses', authenticateToken, async (req, res) => {
    try {
        const trip = await getAuthorizedTrip(req, res);
        if (!trip) return;
        const { amount, currency, category, note, splitWith } = req.body;
        if (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || !Array.isArray(splitWith) || splitWith.length === 0 || new Set(splitWith).size !== splitWith.length || splitWith.some(account => !trip.participants.includes(account)) || typeof currency !== 'string' || currency.length < 1 || currency.length > 10 || (typeof category !== 'string' && category !== undefined) || (category?.length || 0) > 50 || (typeof note !== 'string' && note !== undefined) || (note?.length || 0) > 500) return res.status(400).json({ message: '支出資料不合法' });
        const newExpense = new Expense({ tripId: req.params.id, amount: Number(amount), currency, category, note, splitWith, payer: req.user.account, payerName: req.user.nickname || req.user.account });
        await newExpense.save();
        res.status(201).json(newExpense);
    } catch (e) { res.status(500).send("儲存失敗"); }
});

app.delete('/api/expenses/:id', authenticateToken, async (req, res) => {
    try {
        const exp = await Expense.findById(req.params.id);
        if (!exp) return res.status(404).json({ message: "找不到該支出" });
        const trip = await Trip.findById(exp.tripId);
        if (!trip) return res.status(404).json({ message: '找不到該行程' });
        if (exp.payer !== req.user.account && !await isTripCreatorOrAdmin(trip, req.user)) return res.status(403).json({ message: '你沒有權限存取這個內容' });
        await Expense.findByIdAndDelete(req.params.id);
        res.json({ message: "已刪除" });
    } catch (e) { res.status(500).json({ message: "刪除失敗" }); }
});

app.post('/api/trips/:id/ai', authenticateToken, async (req, res) => {
    try {
        const trip = await getAuthorizedTrip(req, res);
        if (!trip) return;
        const validation = validateQuestion(req.body.question);
        if (!validation.ok) return res.status(400).json({ message: '問題內容不合法' });
        if (!aiProvider.isConfigured()) return res.status(503).json({ message: 'AI 助手尚未設定', category: 'AI_NOT_CONFIGURED' });
        if (!aiRateWindow.allow(req.user.account)) return res.status(429).json({ message: 'AI 請求過於頻繁，請稍後再試' });

        const expenses = await Expense.find({ tripId: trip._id.toString() }).sort({ createdAt: -1 });
        const answer = await aiProvider.answerTripQuestion(validation.value, buildTripContext(trip, expenses));
        res.json({ answer });
    } catch (error) {
        const category = error.category || 'AI_PROVIDER_FAILURE';
        const response = aiProvider.AI_ERROR_RESPONSES[category] || aiProvider.AI_ERROR_RESPONSES.AI_PROVIDER_FAILURE;
        console.error('AI provider error:', {
            category,
            status: error.providerStatus || null,
            code: error.providerCode || null
        });
        res.status(response.status).json({ message: response.message, category });
    }
});

// [相簿 API]
app.get('/api/trips/:id/photos', authenticateToken, async (req, res) => {
    try {
        if (!await getAuthorizedTrip(req, res)) return;
        const photos = await Photo.find({ tripId: req.params.id }).sort({ dayIndex: 1, order: 1 });
        res.json(photos);
    } catch (e) { res.status(500).send("讀取失敗"); }
});

app.post('/api/trips/:id/photos', authenticateToken, async (req, res) => {
    try {
        const trip = await getAuthorizedTrip(req, res);
        if (!trip) return;
        const { imageData, dayIndex, order } = req.body;
        if (!validImageData(imageData, 3 * 1024 * 1024) || !Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex >= trip.days.length || (order !== undefined && (!Number.isInteger(order) || order < 0))) return res.status(400).json({ message: '照片資料不合法' });
        const newPhoto = new Photo({ tripId: req.params.id, imageData, dayIndex, order: order === undefined ? 999 : order, uploader: req.user.nickname || req.user.account, uploaderAccount: req.user.account });
        await newPhoto.save();
        res.status(201).json(newPhoto);
    } catch (e) { res.status(500).send("儲存失敗"); }
});

app.put('/api/photos/reorder', authenticateToken, async (req, res) => {
    try {
        const { photoOrders } = req.body;
        if (!Array.isArray(photoOrders) || photoOrders.length === 0) return res.status(400).json({ message: '照片資料不合法' });
        const first = await Photo.findById(photoOrders[0].id);
        if (!first) return res.status(404).json({ message: "找不到照片" });
        const trip = await Trip.findById(first.tripId);
        if (!trip) return res.status(404).json({ message: '找不到該行程' });
        if (!isTripParticipant(trip, req.user)) return res.status(403).json({ message: '你沒有權限存取這個內容' });
        for (const item of photoOrders) {
            if (!Number.isInteger(item.order) || item.order < 0 || !Number.isInteger(item.dayIndex) || item.dayIndex < 0 || item.dayIndex >= trip.days.length) return res.status(400).json({ message: '照片排序資料不合法' });
            const photo = await Photo.findById(item.id);
            if (!photo || photo.tripId !== first.tripId) return res.status(400).json({ message: '照片資料不合法' });
        }
        for (const item of photoOrders) {
            await Photo.findByIdAndUpdate(item.id, { order: item.order, dayIndex: item.dayIndex });
        }
        res.json({ message: "排序與分類已更新" });
    } catch (e) { res.status(500).send("更新失敗"); }
});

app.delete('/api/photos/:id', authenticateToken, async (req, res) => {
    try {
        const photo = await Photo.findById(req.params.id);
        if (!photo) return res.status(404).json({ message: "找不到照片" });
        const trip = await Trip.findById(photo.tripId);
        if (!trip) return res.status(404).json({ message: '找不到該行程' });
        if (photo.uploaderAccount !== req.user.account && !await isTripCreatorOrAdmin(trip, req.user)) return res.status(403).json({ message: '你沒有權限存取這個內容' });
        await Photo.findByIdAndDelete(req.params.id);
        res.json({ message: "照片已刪除" });
    } catch (error) {
        console.error('Photo delete failed:', error);
        res.status(500).json({ message: "刪除照片失敗" });
    }
});

// [跑馬燈 API]
app.get('/api/settings/marquee', async (req, res) => {
    const marquee = await Setting.findOne({ key: 'marquee' });
    res.json({ text: marquee ? marquee.value : "歡迎來到 YashYash，祝您旅途愉快！" });
});

app.put('/api/settings/marquee', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { text } = req.body;
        if (typeof text !== 'string' || !text.trim() || text.length > 500) return res.status(400).json({ message: '公告內容不合法' });
        await Setting.findOneAndUpdate({ key: 'marquee' }, { value: text }, { upsert: true });
        res.json({ message: "跑馬燈更新成功" });
    } catch (error) { res.status(500).json({ message: '跑馬燈更新失敗' }); }
});

const PORT = process.env.PORT || 3000;
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token;
        if (!token || !JWT_SECRET) return next(new Error('unauthorized'));
        const payload = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(payload.sub);
        if (!user || !isTokenVersionCurrent(payload, user)) return next(new Error('unauthorized'));
        socket.user = user;
        next();
    } catch (error) {
        next(new Error('unauthorized'));
    }
});

io.on('connection', socket => {
    socket.join(`user:${socket.user.account}`);
    socket.on('trip:join', async (tripId, acknowledge = () => {}) => {
        const respond = typeof acknowledge === 'function' ? acknowledge : () => {};
        try {
            if (!mongoose.isValidObjectId(tripId)) return respond({ ok: false, message: '無法加入行程聊天室' });
            const trip = await Trip.findById(tripId);
            if (!trip || !isTripParticipant(trip, socket.user)) return respond({ ok: false, message: '無法加入行程聊天室' });
            await socket.join(`trip:${trip._id}`);
            respond({ ok: true });
        } catch (error) {
            respond({ ok: false, message: '無法加入行程聊天室' });
        }
    });
});

httpServer.listen(PORT, () => console.log(`🚀 YashYash 伺服器運作中: ${PORT}`));

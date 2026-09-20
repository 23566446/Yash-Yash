const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// 中間件：調高限制以支持大頭照
app.use(cors({
    origin: ['https://23566446.github.io', 'http://127.0.0.1:5500', 'http://localhost:5500'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const MONGO_URI =  process.env.MONGO_URI;

mongoose.connect(MONGO_URI).then(() => console.log("✅ 成功連上 MongoDB!"));

// 資料模型
const User = mongoose.model('User', new mongoose.Schema({
    account: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    nickname: String,
    gender: String,
    role: { type: String, default: 'user' },
    avatar: { type: String, default: "" }
}));

const Proposal = mongoose.model('Proposal', new mongoose.Schema({
    creator: String,
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
    days: [{
        dayNumber: Number,
        locations: [{ name: String, addr: String, lat: Number, lng: Number, note: String, time: String }]
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
const Expense = mongoose.model('Expense', ExpenseSchema);

const PhotoSchema = new mongoose.Schema({
    tripId: String,
    uploader: String,
    imageData: String,
    dayIndex: Number,
    order: Number,
    createdAt: { type: Date, default: Date.now }
});
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
        const license = await License.findOne({ key: licenseKey?.trim() });
        if (!license || license.used >= license.limit) return res.status(403).json({ message: "金鑰無效或已達使用上限" });

        const existingUser = await User.findOne({ account });
        if (existingUser) return res.status(400).json({ message: "帳號已存在" });

        const finalRole = (account === 'admin') ? 'admin' : 'user';
        const newUser = new User({ account, password, nickname, gender, role: finalRole });
        await newUser.save();

        license.used += 1;
        await license.save();

        res.status(201).json({ message: "註冊成功", user: newUser });
    } catch (error) { res.status(500).json({ message: "伺服器錯誤" }); }
});

// [登入]
app.post('/api/login', async (req, res) => {
    try {
        const { account, password } = req.body;
        const user = await User.findOne({ account, password });
        if (user) res.json({ message: "登入成功", user });
        else res.status(401).json({ message: "帳號或密碼錯誤" });
    } catch (error) { res.status(500).json({ message: "伺服器錯誤" }); }
});

// [變更角色權限]
app.put('/api/admin/change-role', async (req, res) => {
    try {
        const { targetUserId, newRole } = req.body;
        const target = await User.findById(targetUserId);
        if (target.account === 'admin') return res.status(403).json({ message: "不可更動超級管理員權限" });
        const updatedUser = await User.findByIdAndUpdate(targetUserId, { role: newRole }, { new: true });
        res.json({ message: "權限更新成功", user: updatedUser });
    } catch (e) { res.status(500).json({ message: "更新失敗" }); }
});

// [更新個人資料]
app.put('/api/users/update', async (req, res) => {
    try {
        const { userId, nickname, password, gender, avatar } = req.body;
        let updateData = { nickname, gender, avatar };
        let passwordChanged = false;
        if (password && password.trim() !== "") {
            updateData.password = password;
            passwordChanged = true; 
        }
        const user = await User.findByIdAndUpdate(userId, updateData, { new: true });
        res.json({ message: "更新成功", user, logoutRequired: passwordChanged });
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
app.get('/api/admin/users', async (req, res) => { res.json(await User.find({}, '-password')); });
app.get('/api/admin/licenses', async (req, res) => { res.json(await License.find().sort({ createdAt: -1 })); });
app.post('/api/admin/licenses', async (req, res) => {
    const key = "YASH-" + Math.random().toString(36).substring(2, 6).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
    const newL = new License({ key, limit: parseInt(req.body.limit) });
    await newL.save(); res.json(newL);
});
app.delete('/api/admin/licenses/:id', async (req, res) => {
    try {
        const result = await License.findByIdAndDelete(req.params.id);
        if (!result) return res.status(404).json({ message: "找不到該金鑰" });
        res.json({ message: "金鑰已刪除" });
    } catch (e) { res.status(500).json({ message: "伺服器刪除出錯" }); }
});
app.put('/api/admin/reset-password', async (req, res) => {
    await User.findByIdAndUpdate(req.body.targetUserId, { password: req.body.newPassword });
    res.json({ message: "密碼重設成功" });
});
app.delete('/api/admin/users/:id', async (req, res) => {
    const target = await User.findById(req.params.id);
    if (target.account === 'admin') return res.status(403).json({ message: "不可刪除管理員" });
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "已移除使用者" });
});

// [公告欄與行程 API]
app.get('/api/proposals', async (req, res) => res.json(await Proposal.find()));
app.post('/api/proposals', async (req, res) => {
    if (!req.body.start || !req.body.end) return res.status(400).json({ message: "日期必填" });
    const newP = new Proposal(req.body); 
    await newP.save(); 
    res.status(201).json(newP);
});

app.put('/api/proposals/:id', async (req, res) => {
    try {
        const { start, end, min } = req.body;
        const prop = await Proposal.findById(req.params.id);
        if (!prop) return res.status(404).json({ message: "找不到該提案" });

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

app.delete('/api/proposals/:id', async (req, res) => { 
    await Proposal.findByIdAndDelete(req.params.id); 
    res.json({ message: "OK" }); 
});

app.post('/api/proposals/vote', async (req, res) => {
    const { proposalId, account } = req.body;
    const prop = await Proposal.findById(proposalId);
    
    if (!prop.votes.includes(account)) {
        prop.votes.push(account);
        if (prop.votes.length >= prop.min) {
            prop.status = 'pending'; 
        }
        await prop.save();
        res.json({ message: "投票成功", status: prop.status });
    } else {
        res.status(400).json({ message: "已投過票" });
    }
});

app.post('/api/trips/confirm', async (req, res) => {
    try {
        const { proposalId, action, title } = req.body;
        const prop = await Proposal.findById(proposalId);
        if (!prop) return res.status(404).json({ message: "找不到提案" });

        if (action === 'confirm') {
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
                days: Array.from({ length: diff }, (_, i) => ({ dayNumber: i + 1, locations: [] }))
            });
            await t.save();
        }
        await Proposal.findByIdAndDelete(proposalId);
        res.json({ message: "OK" });
    } catch (e) { res.status(500).json({ message: "建立失敗" }); }
});

app.get('/api/my-trips/:account', async (req, res) => {
    try {
        const trips = await Trip.find({ participants: req.params.account });
        res.json(trips);
    } catch (e) { res.status(500).send("讀取失敗"); }
});

app.get('/api/trips/:id', async (req, res) => res.json(await Trip.findById(req.params.id)));

app.post('/api/trips/:id/location', async (req, res) => {
    try {
        const t = await Trip.findById(req.params.id);
        if (!t) return res.status(404).json({ message: "找不到該行程" });
        t.days[req.body.dayIndex].locations.push(req.body.location);
        await t.save();
        res.json(t);
    } catch (e) { res.status(500).json({ message: "新增地點失敗" }); }
});

app.post('/api/trips/:id/location/delete', async (req, res) => {
    try {
        const t = await Trip.findById(req.params.id);
        if (!t) return res.status(404).json({ message: "找不到該行程" });
        t.days[req.body.dayIndex].locations.splice(req.body.locationIndex, 1);
        await t.save();
        res.json(t);
    } catch (e) { res.status(500).json({ message: "刪除地點失敗" }); }
});

app.post('/api/trips/:id/location/reorder', async (req, res) => {
    try {
        const { dayIndex, oldIndex, newIndex } = req.body;
        if (![dayIndex, oldIndex, newIndex].every(Number.isInteger) || dayIndex < 0 || oldIndex < 0 || newIndex < 0) {
            return res.status(400).json({ message: "排序資料不合法" });
        }

        const trip = await Trip.findById(req.params.id);
        if (!trip) return res.status(404).json({ message: "找不到該行程" });
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
app.put('/api/trips/:id/dates', async (req, res) => {
    try {
        const { startDate, endDate } = req.body;
        
        console.log(`📅 收到日期修改請求 - Trip ID: ${req.params.id}`);
        console.log(`新開始日期: ${startDate}`);
        console.log(`新結束日期: ${endDate}`);
        
        if (!startDate || !endDate) {
            return res.status(400).json({ message: "開始日期和結束日期都必填" });
        }
        
        const trip = await Trip.findById(req.params.id);
        if (!trip) return res.status(404).json({ message: "找不到該行程" });
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

app.delete('/api/trips/:id', async (req, res) => {
    try {
        const trip = await Trip.findById(req.params.id);
        if (!trip) return res.status(404).json({ message: "找不到該行程" });
        await Trip.findByIdAndDelete(req.params.id);
        res.json({ message: "OK" });
    } catch (e) { res.status(500).json({ message: "刪除失敗" }); }
});

app.get('/api/notifications/:nickname', async (req, res) => {
    res.json(await Proposal.find({ creator: req.params.nickname, status: 'pending' }));
});

// [聊天室 API]
app.get('/api/trips/:id/chat', async (req, res) => {
    try {
        const trip = await Trip.findById(req.params.id);
        res.json(trip.chatMessages || []);
    } catch (e) { res.status(500).send("讀取聊天紀錄失敗"); }
});

app.post('/api/trips/:id/chat', async (req, res) => {
    try {
        const { sender, text, avatar } = req.body;
        const trip = await Trip.findById(req.params.id);
        if (!trip) return res.status(404).json({ message: "找不到該行程" });
        const newMessage = { sender, text, avatar, time: new Date() };
        trip.chatMessages.push(newMessage);
        await trip.save();
        res.status(201).json(newMessage);
    } catch (e) { res.status(500).send("傳送失敗"); }
});

// [支出記帳 API]
app.get('/api/trips/:id/expenses', async (req, res) => {
    try {
        const expenses = await Expense.find({ tripId: req.params.id }).sort({ createdAt: -1 });
        res.json(expenses);
    } catch (e) { res.status(500).send("讀取失敗"); }
});

app.post('/api/trips/:id/expenses', async (req, res) => {
    try {
        const trip = await Trip.findById(req.params.id);
        if (!trip) return res.status(404).json({ message: "找不到該行程" });
        const newExpense = new Expense({ tripId: req.params.id, ...req.body });
        await newExpense.save();
        res.status(201).json(newExpense);
    } catch (e) { res.status(500).send("儲存失敗"); }
});

app.delete('/api/expenses/:id', async (req, res) => {
    try {
        const exp = await Expense.findById(req.params.id);
        if (!exp) return res.status(404).json({ message: "找不到該支出" });
        await Expense.findByIdAndDelete(req.params.id);
        res.json({ message: "已刪除" });
    } catch (e) { res.status(500).json({ message: "刪除失敗" }); }
});

// [相簿 API]
app.get('/api/trips/:id/photos', async (req, res) => {
    try {
        const photos = await Photo.find({ tripId: req.params.id }).sort({ dayIndex: 1, order: 1 });
        res.json(photos);
    } catch (e) { res.status(500).send("讀取失敗"); }
});

app.post('/api/trips/:id/photos', async (req, res) => {
    try {
        const trip = await Trip.findById(req.params.id);
        if (!trip) return res.status(404).json({ message: "找不到該行程" });
        const newPhoto = new Photo({ tripId: req.params.id, ...req.body });
        await newPhoto.save();
        res.status(201).json(newPhoto);
    } catch (e) { res.status(500).send("儲存失敗"); }
});

app.put('/api/photos/reorder', async (req, res) => {
    try {
        const { photoOrders } = req.body;
        if (!photoOrders || photoOrders.length === 0) return res.json({ message: "排序與分類已更新" });
        const first = await Photo.findById(photoOrders[0].id);
        if (!first) return res.status(404).json({ message: "找不到照片" });
        for (const item of photoOrders) {
            await Photo.findByIdAndUpdate(item.id, { order: item.order, dayIndex: item.dayIndex });
        }
        res.json({ message: "排序與分類已更新" });
    } catch (e) { res.status(500).send("更新失敗"); }
});

app.delete('/api/photos/:id', async (req, res) => {
    try {
        const photo = await Photo.findById(req.params.id);
        if (!photo) return res.status(404).json({ message: "找不到照片" });
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

app.put('/api/settings/marquee', async (req, res) => {
    const { text } = req.body;
    await Setting.findOneAndUpdate({ key: 'marquee' }, { value: text }, { upsert: true });
    res.json({ message: "跑馬燈更新成功" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 YashYash 伺服器運作中: ${PORT}`));

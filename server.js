const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// --- 1. 中間件與 CORS 設定 (必須在最前面) ---
app.use(cors({
    origin: '*', // 部署初期建議先設為 * 確保連線，穩定後再改回 GitHub 網址
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// --- 2. 資料庫連線 ---
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error("❌ 找不到 MONGO_URI，伺服器停止");
    process.exit(1);
}

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ 成功連上 MongoDB!"))
    .catch(err => console.error("❌ DB 連線失敗:", err));

// --- 3. 資料模型 (Models) ---
const User = mongoose.model('User', new mongoose.Schema({
    account: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    nickname: String, gender: String, role: { type: String, default: 'user' }, avatar: String
}));

const Proposal = mongoose.model('Proposal', new mongoose.Schema({
    creator: String, start: String, end: String, min: Number, votes: [String], status: { type: String, default: 'voting' }
}));

const Trip = mongoose.model('Trip', new mongoose.Schema({
    title: String, startDate: String, endDate: String, participants: [String], creator: String,
    days: [{ dayNumber: Number, locations: Array }],
    chatMessages: [{ sender: String, text: String, avatar: String, time: { type: Date, default: Date.now } }]
}));

const License = mongoose.model('License', new mongoose.Schema({
    key: String, limit: Number, used: { type: Number, default: 0 }, createdAt: { type: Date, default: Date.now }
}));

const Photo = mongoose.model('Photo', new mongoose.Schema({
    tripId: String, uploader: String, imageData: String, dayIndex: Number, order: { type: Number, default: 0 }, createdAt: { type: Date, default: Date.now }
}));

const Expense = mongoose.model('Expense', new mongoose.Schema({
    tripId: String, payer: String, payerName: String, amount: Number, currency: String, category: String, note: String, splitWith: [String], createdAt: { type: Date, default: Date.now }
}));

const Setting = mongoose.model('Setting', new mongoose.Schema({ key: String, value: String }));

// --- 4. API 路由 (Routes) ---

// [註冊與登入]
app.post('/api/register', async (req, res) => {
    try {
        const { account, password, nickname, gender, licenseKey } = req.body;
        const license = await License.findOne({ key: licenseKey?.trim() });
        if (!license || license.used >= license.limit) return res.status(403).json({ message: "金鑰無效或已滿" });
        const newUser = new User({ account, password, nickname, gender, role: (account === 'admin' ? 'admin' : 'user') });
        await newUser.save();
        license.used += 1; await license.save();
        res.status(201).json({ user: newUser });
    } catch (e) { res.status(500).json({ message: "註冊失敗" }); }
});

app.post('/api/login', async (req, res) => {
    const user = await User.findOne({ account: req.body.account, password: req.body.password });
    if (user) res.json({ user });
    else res.status(401).json({ message: "帳密錯誤" });
});

// [行程與公告]
app.get('/api/proposals', async (req, res) => res.json(await Proposal.find()));
app.post('/api/proposals', async (req, res) => {
    const p = new Proposal(req.body); await p.save(); res.status(201).json(p);
});
app.put('/api/proposals/:id', async (req, res) => {
    const { start, end, min } = req.body;
    const p = await Proposal.findById(req.params.id);
    p.start = start; p.end = end; p.min = min;
    p.status = (p.votes.length >= min) ? 'pending' : 'voting';
    await p.save(); res.json(p);
});
app.delete('/api/proposals/:id', async (req, res) => { await Proposal.findByIdAndDelete(req.params.id); res.json({ message: "OK" }); });

app.post('/api/proposals/vote', async (req, res) => {
    const p = await Proposal.findById(req.body.proposalId);
    if (!p.votes.includes(req.body.account)) {
        p.votes.push(req.body.account);
        if (p.votes.length >= p.min) p.status = 'pending';
        await p.save(); res.json({ status: p.status });
    } else res.status(400).send("已投");
});

// [正式行程管理]
app.post('/api/trips/confirm', async (req, res) => {
    const { proposalId, action, title } = req.body;
    const prop = await Proposal.findById(proposalId);
    if (action === 'confirm') {
        const exist = await Trip.findOne({ title });
        if (exist) return res.status(400).json({ message: "名稱重複" });
        const start = new Date(prop.start); const end = new Date(prop.end);
        const diff = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;
        const t = new Trip({
            title, startDate: prop.start, endDate: prop.end, participants: prop.votes, creator: prop.creator,
            days: Array.from({ length: diff }, (_, i) => ({ dayNumber: i + 1, locations: [] }))
        });
        await t.save();
    }
    await Proposal.findByIdAndDelete(proposalId); res.json({ message: "OK" });
});

app.get('/api/my-trips/:account', async (req, res) => res.json(await Trip.find({ participants: req.params.account })));
app.get('/api/trips/:id', async (req, res) => res.json(await Trip.findById(req.params.id)));
app.delete('/api/trips/:id', async (req, res) => { await Trip.findByIdAndDelete(req.params.id); res.json({ message: "OK" }); });

// [地點管理]
app.post('/api/trips/:id/location', async (req, res) => {
    const t = await Trip.findById(req.params.id); t.days[req.body.dayIndex].locations.push(req.body.location);
    await t.save(); res.json(t);
});
app.post('/api/trips/:id/location/delete', async (req, res) => {
    const t = await Trip.findById(req.params.id); t.days[req.body.dayIndex].locations.splice(req.body.locationIndex, 1);
    await t.save(); res.json(t);
});

// [相簿管理]
app.get('/api/trips/:id/photos', async (req, res) => {
    res.json(await Photo.find({ tripId: req.params.id }).sort({ dayIndex: 1, order: 1 }));
});
app.post('/api/trips/:id/photos', async (req, res) => {
    const p = new Photo({ tripId: req.params.id, ...req.body }); await p.save(); res.status(201).json(p);
});
app.delete('/api/photos/:id', async (req, res) => { await Photo.findByIdAndDelete(req.params.id); res.json({ message: "OK" }); });
app.put('/api/photos/reorder', async (req, res) => {
    for (let item of req.body.photoOrders) { await Photo.findByIdAndUpdate(item.id, { order: item.order, dayIndex: item.dayIndex }); }
    res.json({ message: "OK" });
});

// [聊天室]
app.get('/api/trips/:id/chat', async (req, res) => {
    const t = await Trip.findById(req.params.id); res.json(t.chatMessages || []);
});
app.post('/api/trips/:id/chat', async (req, res) => {
    const t = await Trip.findById(req.params.id); t.chatMessages.push(req.body); await t.save(); res.status(201).json(req.body);
});

// [記帳本]
app.get('/api/trips/:id/expenses', async (req, res) => res.json(await Expense.find({ tripId: req.params.id }).sort({ createdAt: -1 })));
app.post('/api/trips/:id/expenses', async (req, res) => {
    const e = new Expense({ tripId: req.params.id, ...req.body }); await e.save(); res.status(201).json(e);
});
app.delete('/api/expenses/:id', async (req, res) => { await Expense.findByIdAndDelete(req.params.id); res.json({ message: "OK" }); });

// [管理員、通知、跑馬燈]
app.get('/api/admin/users', async (req, res) => res.json(await User.find({}, '-password')));
app.get('/api/admin/licenses', async (req, res) => res.json(await License.find().sort({ createdAt: -1 })));
app.get('/api/settings/marquee', async (req, res) => {
    const m = await Setting.findOne({ key: 'marquee' });
    res.json({ text: m ? m.value : "歡迎來到 YashYash！" });
});
app.put('/api/settings/marquee', async (req, res) => {
    await Setting.findOneAndUpdate({ key: 'marquee' }, { value: req.body.text }, { upsert: true });
    res.json({ message: "OK" });
});
app.get('/api/notifications/:nickname', async (req, res) => res.json(await Proposal.find({ creator: req.params.nickname, status: 'pending' })));

// --- 5. 啟動伺服器 ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 YashYash Server is Live on Port ${PORT}`));

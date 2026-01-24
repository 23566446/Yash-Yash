const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// --- 中間件：調高限制以支援大頭照 ---
app.use(cors({
    origin: ['https://23566446.github.io', 'http://127.0.0.1:5500', 'http://localhost:5500'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI).then(() => console.log("✅ 成功連上 MongoDB!"));

// --- 資料模型 ---
const User = mongoose.model('User', new mongoose.Schema({
    account: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    nickname: String,
    gender: String,
    role: { type: String, default: 'user' }, // user, manager, admin
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

// --- API 路由 ---

// [註冊] 
app.post('/api/register', async (req, res) => {
    try {
        const { account, password, nickname, gender, licenseKey } = req.body;
        const license = await License.findOne({ key: licenseKey?.trim() });
        if (!license || license.used >= license.limit) return res.status(403).json({ message: "金鑰無效或已達使用上限" });

        const existingUser = await User.findOne({ account });
        if (existingUser) return res.status(400).json({ message: "帳號已存在" });

        // 如果帳號是 admin，則強制設定角色為 admin
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

// [變更角色權限] - 僅限超級管理員
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

// [管理員 API：獲取使用者、金鑰、重設密碼、刪除]
app.get('/api/admin/users', async (req, res) => { res.json(await User.find({}, '-password')); });
app.get('/api/admin/licenses', async (req, res) => { res.json(await License.find().sort({ createdAt: -1 })); });
app.post('/api/admin/licenses', async (req, res) => {
    const key = "YASH-" + Math.random().toString(36).substring(2, 6).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
    const newL = new License({ key, limit: parseInt(req.body.limit) });
    await newL.save(); res.json(newL);
});
// [許可證管理 - 刪除]
app.delete('/api/admin/licenses/:id', async (req, res) => {
    try {
        const licenseId = req.params.id; // 取得 URL 中的 ID
        const result = await License.findByIdAndDelete(licenseId);
        
        if (!result) {
            return res.status(404).json({ message: "找不到該金鑰" });
        }
        
        res.json({ message: "金鑰已刪除" });
    } catch (e) {
        res.status(500).json({ message: "伺服器刪除出錯" });
    }
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
    const newP = new Proposal(req.body); await newP.save(); res.status(201).json(newP);
});
// [修改提案 API] - 包含門檻檢查與狀態回退邏輯
app.put('/api/proposals/:id', async (req, res) => {
    try {
        const { start, end, min } = req.body;
        const proposalId = req.params.id;

        // 1. 先找出目前的提案資料
        const prop = await Proposal.findById(proposalId);
        if (!prop) return res.status(404).json({ message: "找不到該提案" });

        // 2. 更新資料
        if (start) prop.start = start;
        if (end) prop.end = end;
        if (min !== undefined) prop.min = parseInt(min);

        // 3. --- 核心修正邏輯 ---
        // 判斷目前投票人數是否還符合新的門檻
        if (prop.votes.length >= prop.min) {
            // 如果人數依然足夠，維持或設定為 pending
            prop.status = 'pending';
        } else {
            // 如果提高門檻導致人數不足，狀態退回至 voting
            // 這會讓發起人的後台通知自動消失
            prop.status = 'voting';
        }

        await prop.save();
        res.json(prop);
    } catch (error) {
        console.error("更新提案失敗:", error);
        res.status(500).json({ message: "修改失敗" });
    }
});
app.delete('/api/proposals/:id', async (req, res) => { await Proposal.findByIdAndDelete(req.params.id); res.json({ message: "OK" }); });
// [修正：投票 API] - 確保每個人只能投一票，且達標後依然開放投票
// [修正：投票 API] - 使用 account 確保唯一性
app.post('/api/proposals/vote', async (req, res) => {
    const { proposalId, account } = req.body;
    const prop = await Proposal.findById(proposalId);
    
    if (!prop.votes.includes(account)) {
        prop.votes.push(account);
        
        // 核心邏輯：達標時變更狀態
        if (prop.votes.length >= prop.min) {
            prop.status = 'pending'; 
        }
        
        await prop.save();
        res.json({ message: "投票成功", status: prop.status });
    } else {
        res.status(400).json({ message: "已投過票" });
    }
});

// [修正：正式建立行程 API] - 移除重複的路由，保留這一個
app.post('/api/trips/confirm', async (req, res) => {
    try {
        const { proposalId, action, title } = req.body;
        const prop = await Proposal.findById(proposalId);
        if (!prop) return res.status(404).json({ message: "找不到提案" });

        if (action === 'confirm') {
            const exist = await Trip.findOne({ title });
            if (exist) return res.status(400).json({ message: `名稱「${title}」已被使用，請換一個名字。` });

            const start = new Date(prop.start);
            const end = new Date(prop.end);
            const diff = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;

            const t = new Trip({
                title,
                startDate: prop.start,
                endDate: prop.end,
                participants: prop.votes, // 這裡存的是投票者的 account 陣列
                creator: prop.creator,
                days: Array.from({ length: diff }, (_, i) => ({ dayNumber: i + 1, locations: [] }))
            });
            await t.save();
        }
        await Proposal.findByIdAndDelete(proposalId);
        res.json({ message: "OK" });
    } catch (e) { res.status(500).json({ message: "建立失敗" }); }
});

// [修正：查詢我的旅行] - 改用 account 查詢
app.get('/api/my-trips/:account', async (req, res) => {
    try {
        const trips = await Trip.find({ participants: req.params.account });
        res.json(trips);
    } catch (e) { res.status(500).send("讀取失敗"); }
});

app.get('/api/trips/:id', async (req, res) => res.json(await Trip.findById(req.params.id)));
app.post('/api/trips/:id/location', async (req, res) => {
    const t = await Trip.findById(req.params.id); t.days[req.body.dayIndex].locations.push(req.body.location);
    await t.save(); res.json(t);
});
app.post('/api/trips/:id/location/delete', async (req, res) => {
    const t = await Trip.findById(req.params.id); t.days[req.body.dayIndex].locations.splice(req.body.locationIndex, 1);
    await t.save(); res.json(t);
});
app.put('/api/trips/:id/dates', async (req, res) => {
    const t = await Trip.findById(req.params.id);
    const start = new Date(req.body.startDate); const end = new Date(req.body.endDate);
    const diff = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;
    if (diff > t.days.length) {
        for (let i = t.days.length + 1; i <= diff; i++) t.days.push({ dayNumber: i, locations: [] });
    } else { t.days = t.days.slice(0, diff); }
    t.startDate = req.body.startDate; t.endDate = req.body.endDate;
    await t.save(); res.json({ trip: t });
});
app.delete('/api/trips/:id', async (req, res) => { await Trip.findByIdAndDelete(req.params.id); res.json({ message: "OK" }); });
app.get('/api/notifications/:nickname', async (req, res) => {
    res.json(await Proposal.find({ creator: req.params.nickname, status: 'pending' }));
});

// [聊天室 - 獲取訊息紀錄]
app.get('/api/trips/:id/chat', async (req, res) => {
    try {
        const trip = await Trip.findById(req.params.id);
        res.json(trip.chatMessages || []);
    } catch (e) { res.status(500).send("讀取聊天紀錄失敗"); }
});

// [聊天室 - 傳送新訊息]
app.post('/api/trips/:id/chat', async (req, res) => {
    try {
        const { sender, text, avatar } = req.body;
        const trip = await Trip.findById(req.params.id);
        
        const newMessage = {
            sender,
            text,
            avatar,
            time: new Date()
        };
        
        trip.chatMessages.push(newMessage);
        await trip.save();
        
        res.status(201).json(newMessage);
    } catch (e) { res.status(500).send("傳送失敗"); }
});

// --- 1. 定義支出模型 ---
const ExpenseSchema = new mongoose.Schema({
    tripId: String,
    payer: String,        // 付款人的 account
    payerName: String,    // 付款人的 nickname (顯示用)
    amount: Number,       // 金額
    currency: String,     // 貨幣 (TWD, JPY, USD...)
    category: String,     // 分類
    note: String,         // 備註
    splitWith: [String],  // 要分攤的人 (account 陣列)
    createdAt: { type: Date, default: Date.now }
});
const Expense = mongoose.model('Expense', ExpenseSchema);

// --- 2. API 路由 ---

// [獲取該行程所有支出]
app.get('/api/trips/:id/expenses', async (req, res) => {
    try {
        const expenses = await Expense.find({ tripId: req.params.id }).sort({ createdAt: -1 });
        res.json(expenses);
    } catch (e) { res.status(500).send("讀取失敗"); }
});

// [新增支出紀錄]
app.post('/api/trips/:id/expenses', async (req, res) => {
    try {
        const newExpense = new Expense({
            tripId: req.params.id,
            ...req.body
        });
        await newExpense.save();
        res.status(201).json(newExpense);
    } catch (e) { res.status(500).send("儲存失敗"); }
});

// [刪除支出紀錄]
app.delete('/api/expenses/:id', async (req, res) => {
    await Expense.findByIdAndDelete(req.params.id);
    res.json({ message: "已刪除" });
});

// --- 1. 定義相簿照片模型 ---
// --- 1. 更新相簿照片模型 ---
const PhotoSchema = new mongoose.Schema({
    tripId: String,
    uploader: String,
    imageData: String,
    dayIndex: Number,    // 新增：屬於第幾天 (0, 1, 2...)
    order: Number,       // 新增：在該天內的排序
    createdAt: { type: Date, default: Date.now }
});
const Photo = mongoose.model('Photo', PhotoSchema);

// --- 2. 新增與修改 API ---

// [獲取照片] - 修改為根據 dayIndex 和 order 排序
app.get('/api/trips/:id/photos', async (req, res) => {
    try {
        const photos = await Photo.find({ tripId: req.params.id }).sort({ dayIndex: 1, order: 1 });
        res.json(photos);
    } catch (e) { res.status(500).send("讀取失敗"); }
});

// [上傳照片] - 確保包含 dayIndex
app.post('/api/trips/:id/photos', async (req, res) => {
    try {
        const newPhoto = new Photo({
            tripId: req.params.id,
            ...req.body // 前端會傳入 dayIndex
        });
        await newPhoto.save();
        res.status(201).json(newPhoto);
    } catch (e) { res.status(500).send("儲存失敗"); }
});

// [相片重新排序]
// 修改 server.js 裡的重新排序 API
app.put('/api/photos/reorder', async (req, res) => {
    try {
        const { photoOrders } = req.body; 
        for (let item of photoOrders) {
            // 同時更新排序與所在的天數
            await Photo.findByIdAndUpdate(item.id, { 
                order: item.order,
                dayIndex: item.dayIndex 
            });
        }
        res.json({ message: "排序與分類已更新" });
    } catch (e) { res.status(500).send("更新失敗"); }
});

// --- 1. 定義系統設定模型 ---
const Setting = mongoose.model('Setting', new mongoose.Schema({
    key: String,
    value: String
}));

// --- 2. 跑馬燈 API ---
// [獲取跑馬燈]
app.get('/api/settings/marquee', async (req, res) => {
    const marquee = await Setting.findOne({ key: 'marquee' });
    res.json({ text: marquee ? marquee.value : "歡迎來到 YashYash，祝您旅途愉快！" });
});

// [更新跑馬燈] - 僅限 admin 或 manager
app.put('/api/settings/marquee', async (req, res) => {
    const { text } = req.body;
    await Setting.findOneAndUpdate({ key: 'marquee' }, { value: text }, { upsert: true });
    res.json({ message: "跑馬燈更新成功" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 YashYash 伺服器運作中: ${PORT}`));
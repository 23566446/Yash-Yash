const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// --- [修正點 1] CORS 必須放在最上面，且設定要正確 ---
app.use(cors({
    origin: ['https://23566446.github.io', 'http://127.0.0.1:5500'], // 允許 GitHub 和本地測試
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// --- [修正點 2] 不要寫死密碼，改用環境變數 ---
const MONGO_URI = process.env.MONGO_URI; 

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ 成功連上 MongoDB!"))
    .catch(err => console.error("❌ 連線失敗:", err));

// --- 2. 資料模型 (Models) ---

const UserSchema = new mongoose.Schema({
    account: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    nickname: String,
    gender: String,
    role: { type: String, default: 'user' }
});
const User = mongoose.model('User', UserSchema);

// [行程提案模型] - 增加 status 欄位
const ProposalSchema = new mongoose.Schema({
    creator: String,
    creatorId: String, // 方便後台查詢
    start: String,
    end: String,
    min: Number,
    votes: [String],
    status: { type: String, default: 'voting' } // voting, pending, confirmed, cancelled
});
const Proposal = mongoose.model('Proposal', ProposalSchema);

// [正式行程模型] - 包含天數與聊天室
const TripSchema = new mongoose.Schema({
    title: String,
    startDate: String,
    endDate: String,
    participants: [String],
    creator: String,
    days: [{
        dayNumber: Number,
        locations: [{ name: String, note: String, time: String }]
    }],
    chatMessages: [{
        sender: String,
        text: String,
        time: { type: Date, default: Date.now }
    }]
});

const Trip = mongoose.model('Trip', TripSchema);

// --- 3. API 路由 (Routes) ---

// [註冊]
app.post('/api/register', async (req, res) => {
    try {
        const { account, password, nickname, gender } = req.body;
        const existingUser = await User.findOne({ account });
        if (existingUser) return res.status(400).json({ message: "帳號已存在" });

        const newUser = new User({ account, password, nickname, gender });
        await newUser.save();
        res.status(201).json({ message: "註冊成功", user: newUser });
    } catch (error) {
        res.status(500).json({ message: "伺服器錯誤" });
    }
});

// [登入]
app.post('/api/login', async (req, res) => {
    try {
        const { account, password } = req.body;
        const user = await User.findOne({ account, password });
        if (user) {
            res.json({ message: "登入成功", user });
        } else {
            res.status(401).json({ message: "帳號或密碼錯誤" });
        }
    } catch (error) {
        res.status(500).json({ message: "伺服器錯誤" });
    }
});

// [行程 API]
app.get('/api/proposals', async (req, res) => {
    try {
        const proposals = await Proposal.find();
        res.json(proposals);
    } catch (error) { res.status(500).send("讀取失敗"); }
});

app.post('/api/proposals', async (req, res) => {
    try {
        const newProp = new Proposal(req.body);
        await newProp.save();
        res.status(201).json(newProp);
    } catch (error) { res.status(500).send("發布失敗"); }
});

// [修改提案] - 增加日期檢查與防呆
app.put('/api/proposals/:id', async (req, res) => {
    const { start, end, min } = req.body;
    
    // 防呆：檢查日期是否為空
    if (!start || !end) {
        return res.status(400).json({ message: "日期不得為空" });
    }

    try {
        const updatedProp = await Proposal.findByIdAndUpdate(
            req.params.id, 
            { start, end, min }, 
            { new: true }
        );
        res.json(updatedProp);
    } catch (error) {
        res.status(500).json({ message: "修改失敗" });
    }
});

// 修正後的投票 API
app.post('/api/proposals/vote', async (req, res) => {
    const { proposalId, nickname } = req.body;
    const prop = await Proposal.findById(proposalId);
    
    if (!prop.votes.includes(nickname)) {
        prop.votes.push(nickname);
        
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

// 獲取使用者的通知 (待確認的活動)
app.get('/api/notifications/:nickname', async (req, res) => {
    // 找出我是發起人，且狀態為 pending 的活動
    const pendingTrips = await Proposal.find({ 
        creator: req.params.nickname, 
        status: 'pending' 
    });
    res.json(pendingTrips);
});

// 確認建立活動 (修改版)
// 確認建立活動 (加入重複名稱阻擋)
app.post('/api/trips/confirm', async (req, res) => {
    try {
        const { proposalId, action, title } = req.body;
        const prop = await Proposal.findById(proposalId);

        if (!prop) return res.status(404).json({ message: "找不到該提案" });

        if (action === 'confirm') {
            // --- 關鍵修正：檢查資料庫是否已存在相同名稱的行程 ---
            const finalTitle = title || `${prop.creator} 的旅行`;
            
            // 使用正則表達式進行不分大小寫的檢查，或者直接精確比對
            const existingTrip = await Trip.findOne({ title: finalTitle });
            
            if (existingTrip) {
                // 如果找到相同名稱，回傳 400 錯誤並停止執行
                return res.status(400).json({ message: `名稱「${finalTitle}」已被使用，請換一個名字。` });
            }

            // 計算天數
            const start = new Date(prop.start);
            const end = new Date(prop.end);
            const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;

            // 建立行程
            const newTrip = new Trip({
                title: finalTitle,
                startDate: prop.start,
                endDate: prop.end,
                participants: prop.votes,
                creator: prop.creator,
                days: Array.from({ length: diffDays }, (_, i) => ({ dayNumber: i + 1, locations: [] }))
            });
            await newTrip.save();
        }

        // 刪除原本的提案
        await Proposal.findByIdAndDelete(proposalId);
        res.json({ message: "活動建立成功" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "伺服器發生錯誤" });
    }
});

// [修改正式行程日期] - 核心邏輯：動態調整天數陣列
app.put('/api/trips/:id/dates', async (req, res) => {
    try {
        const { startDate, endDate } = req.body;
        if (!startDate || !endDate) return res.status(400).json({ message: "日期不得為空" });

        const trip = await Trip.findById(req.params.id);
        if (!trip) return res.status(404).json({ message: "找不到行程" });

        // 1. 計算新舊天數差
        const oldDaysCount = trip.days.length;
        const newStart = new Date(startDate);
        const newEnd = new Date(endDate);
        
        // 確保結束日期在開始日期之後
        if (newEnd < newStart) return res.status(400).json({ message: "結束日期不能早於開始日期" });

        const newDaysCount = Math.ceil(Math.abs(newEnd - newStart) / (1000 * 60 * 60 * 24)) + 1;

        // 2. 處理天數陣列的增減
        if (newDaysCount > oldDaysCount) {
            // 天數增加：從原本的最後一天往後補
            for (let i = oldDaysCount + 1; i <= newDaysCount; i++) {
                trip.days.push({ dayNumber: i, locations: [] });
            }
        } else if (newDaysCount < oldDaysCount) {
            // 天數減少：移除末尾多出的天數
            // 建議前端先提示使用者這會刪除資料
            trip.days = trip.days.slice(0, newDaysCount);
        }

        // 3. 更新日期與存檔
        trip.startDate = startDate;
        trip.endDate = endDate;
        await trip.save();

        res.json({ message: "行程天數已重新調整", trip });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "更新失敗" });
    }
});

// 新增：獲取單一行程詳情
app.get('/api/trips/:id', async (req, res) => {
    const trip = await Trip.findById(req.params.id);
    res.json(trip);
});

// 新增：儲存地點到特定天數
app.post('/api/trips/:id/location', async (req, res) => {
    const { dayIndex, location } = req.body; // location: {name, addr, lat, lng}
    const trip = await Trip.findById(req.params.id);
    trip.days[dayIndex].locations.push(location);
    await trip.save();
    res.json(trip);
});

// 獲取我的正式行程
app.get('/api/my-trips/:nickname', async (req, res) => {
    const trips = await Trip.find({ participants: req.params.nickname });
    res.json(trips);
});

// [更新個人資料] - 修正版：包含密碼更換檢測
app.put('/api/users/update', async (req, res) => {
    try {
        const { userId, nickname, password, gender } = req.body;
        let updateData = { nickname, gender };
        let passwordChanged = false;

        if (password && password.trim() !== "") {
            updateData.password = password;
            passwordChanged = true; 
        }

        const user = await User.findByIdAndUpdate(userId, updateData, { new: true });
        res.json({ 
            message: "更新成功", 
            user: user, 
            logoutRequired: passwordChanged 
        });
    } catch (error) {
        res.status(500).json({ message: "更新失敗" });
    }
});

// [管理員：獲取所有使用者]
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find({}, '-password'); 
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: "獲取失敗" });
    }
});

// [超級管理員：強制更改他人密碼]
app.put('/api/admin/reset-password', async (req, res) => {
    try {
        const { targetUserId, newPassword } = req.body;
        await User.findByIdAndUpdate(targetUserId, { password: newPassword });
        res.json({ message: "密碼重設成功" });
    } catch (error) {
        res.status(500).json({ message: "重設失敗" });
    }
});

// [超級管理員：刪除使用者]
app.delete('/api/admin/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        
        // 為了安全，防止 admin 把自己刪掉
        const user = await User.findById(userId);
        if (user && user.account === 'admin') {
            return res.status(403).json({ message: "不能刪除超級管理員帳號" });
        }

        await User.findByIdAndDelete(userId);
        res.json({ message: "使用者已成功移除" });
    } catch (error) {
        res.status(500).json({ message: "刪除失敗" });
    }
});

// [刪除地點]
app.post('/api/trips/:id/location/delete', async (req, res) => {
    const { dayIndex, locationIndex } = req.body;
    const trip = await Trip.findById(req.params.id);
    trip.days[dayIndex].locations.splice(locationIndex, 1); // 移除該索引的地點
    await trip.save();
    res.json(trip);
});

// [重新排序地點]
app.post('/api/trips/:id/location/reorder', async (req, res) => {
    const { dayIndex, oldIndex, newIndex } = req.body;
    const trip = await Trip.findById(req.params.id);
    const list = trip.days[dayIndex].locations;
    const [movedItem] = list.splice(oldIndex, 1); // 取出被拖拽的項目
    list.splice(newIndex, 0, movedItem); // 插入新位置
    await trip.save();
    res.json(trip);
});

// --- 4. 啟動伺服器 ---
// 修改前：const PORT = 3000;
// 修改後：
const PORT = process.env.PORT || 3000; 

app.listen(PORT, () => {
    console.log(`🚀 伺服器已在埠號 ${PORT} 啟動`);
});

// 允許你的 GitHub Pages 網址連線
app.use(cors({
    origin: 'https://23566446.github.io/Yash-Yash/' 
}));




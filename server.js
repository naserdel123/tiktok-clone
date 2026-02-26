const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const REQUIRED_FOLLOWERS_FOR_LIVE = 300;

// ✅ إنشاء uploads تلقائياً لو ما موجود
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 مجلد uploads تم إنشاؤه تلقائياً');
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// تخزين الفيديوهات
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});

const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('فقط ملفات الفيديو مسموحة'), false);
    }
  }
});

// البيانات
let users = [];
let videos = [];
let follows = [];
let lives = new Map();
let socketToUser = new Map();

// فيديوهات تجريبية للبداية
const demoVideos = [
  {
    id: 'demo-1',
    userId: 'demo-user-1',
    url: 'https://assets.mixkit.co/videos/preview/mixkit-girl-in-neon-sign-1232-large.mp4',
    description: '✨ أول فيديو تجريبي - اجمع 300 متابع للبث المباشر!',
    likes: 1234,
    comments: 56,
    shares: 23,
    views: 5678,
    createdAt: Date.now() - 100000
  },
  {
    id: 'demo-2',
    userId: 'demo-user-2',
    url: 'https://assets.mixkit.co/videos/preview/mixkit-woman-running-above-the-clouds-on-a-mountain-32807-large.mp4',
    description: '🏔️ طبيعة خلابة - تابعني لمشاهدة المزيد',
    likes: 3456,
    comments: 128,
    shares: 89,
    views: 12500,
    createdAt: Date.now() - 200000
  },
  {
    id: 'demo-3',
    userId: 'demo-user-3',
    url: 'https://assets.mixkit.co/videos/preview/mixkit-portrait-of-a-fashion-woman-with-silver-makeup-39875-large.mp4',
    description: '💄 مكياج فضي - ما رأيكم؟',
    likes: 892,
    comments: 45,
    shares: 12,
    views: 3400,
    createdAt: Date.now() - 300000
  }
];

// مستخدمون تجريبيون
const demoUsers = [
  {
    id: 'demo-user-1',
    username: 'سارة_الفنانة',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sara',
    followers: 12500,
    following: 450,
    videosCount: 45,
    canGoLive: true,
    isLive: false
  },
  {
    id: 'demo-user-2',
    username: 'محمد_المغامر',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mohammed',
    followers: 8900,
    following: 230,
    videosCount: 32,
    canGoLive: true,
    isLive: false
  },
  {
    id: 'demo-user-3',
    username: 'نورة_موضة',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=noura',
    followers: 5600,
    following: 890,
    videosCount: 67,
    canGoLive: true,
    isLive: false
  }
];

// تهيئة البيانات التجريبية
users.push(...demoUsers);
videos.push(...demoVideos);

// ========== API Routes ==========

// تسجيل/دخول
app.post('/api/auth', (req, res) => {
  const { username } = req.body;
  let user = users.find(u => u.username === username);
  
  if (!user) {
    user = {
      id: uuidv4(),
      username,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
      followers: 0,
      following: 0,
      videosCount: 0,
      canGoLive: false,
      isLive: false,
      totalLikes: 0
    };
    users.push(user);
    console.log('👤 مستخدم جديد:', username);
  }
  
  res.json({ user });
});

// جلب الفيديوهات (الحقيقية + التجريبية)
app.get('/api/videos', (req, res) => {
  const allVideos = [...videos].sort((a, b) => b.createdAt - a.createdAt);
  
  const feed = allVideos.map(v => ({
    ...v,
    user: users.find(u => u.id === v.userId) || demoUsers.find(u => u.id === v.userId) || { 
      username: 'مستخدم', 
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=default' 
    }
  }));
  
  res.json(feed);
});

// رفع فيديو (متاح للجميع - صفر متابع)
app.post('/api/upload', upload.single('video'), (req, res) => {
  try {
    const { userId, description } = req.body;
    const user = users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    // ✅ يقبل الرفع حتى لو صفر متابع!
    const video = {
      id: uuidv4(),
      userId,
      url: req.file ? `/uploads/${req.file.filename}` : demoVideos[0].url,
      description: description || '',
      likes: 0,
      comments: 0,
      shares: 0,
      views: 0,
      createdAt: Date.now()
    };
    
    videos.push(video);
    user.videosCount++;
    
    console.log('🎥 فيديو جديد من:', user.username);
    res.json({ success: true, video });
    
  } catch (error) {
    console.error('خطأ في الرفع:', error);
    res.status(500).json({ error: 'فشل في رفع الفيديو' });
  }
});

// المتابعة
app.post('/api/follow', (req, res) => {
  const { followerId, followingId } = req.body;
  
  if (followerId === followingId) {
    return res.status(400).json({ error: 'لا تستطيع متابعة نفسك' });
  }
  
  const exists = follows.find(f => 
    f.followerId === followerId && f.followingId === followingId
  );
  
  const follower = users.find(u => u.id === followerId);
  const following = users.find(u => u.id === followingId);
  
  if (!follower || !following) {
    return res.status(404).json({ error: 'مستخدم غير موجود' });
  }
  
  if (exists) {
    // إلغاء المتابعة
    follows = follows.filter(f => !(f.followerId === followerId && f.followingId === followingId));
    follower.following--;
    following.followers--;
    
    return res.json({ 
      success: true, 
      following: false,
      follower,
      target: following
    });
  }
  
  // متابعة جديدة
  follows.push({ followerId, followingId, createdAt: Date.now() });
  follower.following++;
  following.followers++;
  
  // ✅ فتح البث عند الوصول لـ 300
  const reachedGoal = following.followers >= REQUIRED_FOLLOWERS_FOR_LIVE && !following.canGoLive;
  if (reachedGoal) {
    following.canGoLive = true;
    console.log('🎉', following.username, 'وصل 300 متابع!');
  }
  
  res.json({ 
    success: true, 
    following: true,
    follower,
    target: following,
    reachedGoal,
    message: reachedGoal ? '🎉 تهانينا! يمكنك الآن البث المباشر!' : null
  });
});

// قائمة مقترحة (غير المتابعين)
app.get('/api/suggested/:userId', (req, res) => {
  const { userId } = req.params;
  const followingIds = follows
    .filter(f => f.followerId === userId)
    .map(f => f.followingId);
  
  // دمج المستخدمين الحقيقيين + التجريبيين
  const allUsers = [...users, ...demoUsers.filter(d => !users.find(u => u.id === d.id))];
  
  const suggested = allUsers
    .filter(u => u.id !== userId && !followingIds.includes(u.id))
    .sort((a, b) => b.followers - a.followers)
    .slice(0, 10);
  
  res.json(suggested);
});

// البحث عن مستخدمين
app.get('/api/search/users', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  
  const allUsers = [...users, ...demoUsers];
  const results = allUsers.filter(u => 
    u.username.toLowerCase().includes(q.toLowerCase())
  ).map(u => ({
    id: u.id,
    username: u.username,
    avatar: u.avatar,
    followers: u.followers
  }));
  
  res.json(results);
});

// لوحة المتصدرين
app.get('/api/leaderboard', (req, res) => {
  const allUsers = [...users, ...demoUsers];
  const sorted = [...allUsers]
    .sort((a, b) => b.followers - a.followers)
    .slice(0, 20);
  res.json(sorted);
});

// جلب متابعيني
app.get('/api/followers/:userId', (req, res) => {
  const followerIds = follows
    .filter(f => f.followingId === req.params.userId)
    .map(f => f.followerId);
  
  const followers = users.filter(u => followerIds.includes(u.id));
  res.json(followers);
});

// إعجاب
app.post('/api/videos/:id/like', (req, res) => {
  const video = videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'الفيديو غير موجود' });
  
  video.likes++;
  const user = users.find(u => u.id === video.userId);
  if (user) user.totalLikes++;
  
  res.json({ likes: video.likes });
});

// تعليق
app.post('/api/videos/:id/comment', (req, res) => {
  const { text, username } = req.body;
  const video = videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'الفيديو غير موجود' });
  
  video.comments++;
  res.json({ 
    success: true, 
    comment: {
      id: uuidv4(),
      username,
      text,
      createdAt: Date.now()
    }
  });
});

// ========== WebRTC Live Streaming ==========

io.on('connection', (socket) => {
  console.log('🔌 متصل:', socket.id);
  
  socket.on('join-live', ({ liveId, userId }) => {
    socket.join(liveId);
    socketToUser.set(socket.id, userId);
    
    const live = lives.get(liveId);
    if (live) {
      live.viewers++;
      io.to(liveId).emit('viewer-count', live.viewers);
      socket.emit('live-info', live);
    }
  });
  
  socket.on('start-live', ({ userId, title }) => {
    const user = users.find(u => u.id === userId);
    
    if (!user) {
      socket.emit('error', 'المستخدم غير موجود');
      return;
    }
    
    if (!user.canGoLive) {
      socket.emit('error', `تحتاج ${REQUIRED_FOLLOWERS_FOR_LIVE} متابع للبث`);
      return;
    }
    
    const liveId = uuidv4();
    user.isLive = true;
    
    const live = {
      id: liveId,
      userId,
      title: title || 'بث مباشر',
      viewers: 0,
      likes: 0,
      comments: [],
      startedAt: Date.now()
    };
    
    lives.set(liveId, live);
    socket.join(liveId);
    
    // إشعار للجميع
    socket.broadcast.emit('live-started', { 
      liveId, 
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar
      }, 
      title: live.title 
    });
    
    socket.emit('live-ready', { liveId });
    console.log('🔴 بث مباشر بدأ:', user.username);
  });
  
  socket.on('end-live', ({ liveId }) => {
    const live = lives.get(liveId);
    if (live) {
      io.to(liveId).emit('live-ended');
      lives.delete(liveId);
      
      const user = users.find(u => u.id === live.userId);
      if (user) user.isLive = false;
      
      console.log('⭕ بث منتهي:', liveId);
    }
  });
  
  // WebRTC Signaling
  socket.on('offer', ({ liveId, offer }) => {
    socket.to(liveId).emit('offer', offer);
  });
  
  socket.on('answer', ({ liveId, answer }) => {
    socket.to(liveId).emit('answer', answer);
  });
  
  socket.on('ice-candidate', ({ liveId, candidate }) => {
    socket.to(liveId).emit('ice-candidate', candidate);
  });
  
  socket.on('live-like', ({ liveId }) => {
    const live = lives.get(liveId);
    if (live) {
      live.likes++;
      io.to(liveId).emit('like-animation');
    }
  });
  
  socket.on('live-comment', ({ liveId, text, username }) => {
    const live = lives.get(liveId);
    if (live) {
      const comment = { 
        id: uuidv4(), 
        text, 
        username, 
        createdAt: Date.now() 
      };
      live.comments.push(comment);
      io.to(liveId).emit('new-comment', comment);
    }
  });
  
  socket.on('disconnect', () => {
    const userId = socketToUser.get(socket.id);
    socketToUser.delete(socket.id);
    
    // إزالة من البثوث
    lives.forEach((live, liveId) => {
      if (socket.rooms.has(liveId)) {
        live.viewers = Math.max(0, live.viewers - 1);
        io.to(liveId).emit('viewer-count', live.viewers);
      }
    });
    
    console.log('❌ منفصل:', socket.id);
  });
});

// جلب البثوث النشطة
app.get('/api/lives', (req, res) => {
  const activeLives = Array.from(lives.values()).map(live => ({
    ...live,
    user: users.find(u => u.id === live.userId) || demoUsers.find(u => u.id === live.userId)
  }));
  res.json(activeLives);
});

// Error handling
app.use((error, req, res, next) => {
  console.error('خطأ:', error);
  res.status(500).json({ error: error.message || 'خطأ في السيرفر' });
});

server.listen(PORT, () => {
  console.log(`
  🚀 TikTok Clone يعمل على http://localhost:${PORT}
  
  📊 الإحصائيات:
  • ${users.length} مستخدم
  • ${videos.length} فيديو (${demoVideos.length} تجريبي)
  • ${follows.length} متابعة
  
  🎯 الهدف: ${REQUIRED_FOLLOWERS_FOR_LIVE} متابع للبث المباشر
  `);
});
                                                           

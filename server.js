const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const REQUIRED_FOLLOWERS_FOR_LIVE = 300;
const STORY_DURATION = 24 * 60 * 60 * 1000; // 24 ساعة

// إنشاء المجلدات
['uploads', 'uploads/videos', 'uploads/avatars', 'uploads/stories'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// تخزين الملفات
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folders = {
      'video': 'uploads/videos',
      'avatar': 'uploads/avatars',
      'story': 'uploads/stories'
    };
    cb(null, folders[file.fieldname] || 'uploads');
  },
  filename: (req, file, cb) => {
    cb(null, uuidv4() + path.extname(file.originalname));
  }
});

const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// ========== قاعدة البيانات ==========

// الهدايا
const GIFTS = {
  rose: { id: 'rose', name: 'وردة', icon: '🌹', price: 1, animation: 'float', diamonds: 1 },
  panda: { id: 'panda', name: 'بندة', icon: '🐼', price: 5, animation: 'bounce', diamonds: 5 },
  love: { id: 'love', name: 'قلب', icon: '❤️', price: 10, animation: 'pulse', diamonds: 10 },
  kiss: { id: 'kiss', name: 'قبلة', icon: '💋', price: 20, animation: 'fly', diamonds: 20 },
  fire: { id: 'fire', name: 'نار', icon: '🔥', price: 50, animation: 'burn', diamonds: 50 },
  lion: { id: 'lion', name: 'أسد', icon: '🦁', price: 100, animation: 'roar', diamonds: 100 },
  unicorn: { id: 'unicorn', name: 'يونيكورن', icon: '🦄', price: 150, animation: 'magic', diamonds: 150 },
  elephant: { id: 'elephant', name: 'فيل', icon: '🐘', price: 200, animation: 'stampede', diamonds: 200 },
  dragon: { id: 'dragon', name: 'تنين', icon: '🐲', price: 300, animation: 'fly', diamonds: 300 },
  crown: { id: 'crown', name: 'تاج', icon: '👑', price: 500, animation: 'shine', diamonds: 500 },
  castle: { id: 'castle', name: 'قلعة', icon: '🏰', price: 1000, animation: 'build', diamonds: 1000 },
  rocket: { id: 'rocket', name: 'صاروخ', icon: '🚀', price: 2000, animation: 'launch', diamonds: 2000 },
  planet: { id: 'planet', name: 'كوكب', icon: '🪐', price: 5000, animation: 'orbit', diamonds: 5000 },
  galaxy: { id: 'galaxy', name: 'مجرة', icon: '🌌', price: 10000, animation: 'explode', diamonds: 10000 }
};

// التحديات
const CHALLENGES = [
  {
    id: 'dance-2024',
    title: 'تحدي الرقص 2024',
    description: 'ارقص على أغنية الموسم',
    hashtag: '#رقص_2024',
    prize: 1000,
    participants: 0,
    trending: true,
    thumbnail: '🕺',
    createdAt: Date.now()
  },
  {
    id: 'comedy-challenge',
    title: 'تحدي الضحك',
    description: 'اضحك العالم في 15 ثانية',
    hashtag: '#ضحك_تحدي',
    prize: 500,
    participants: 0,
    trending: true,
    thumbnail: '😂',
    createdAt: Date.now()
  },
  {
    id: 'cooking-fast',
    title: 'طبخ في دقيقة',
    description: 'أطبخ وجبة كاملة في 60 ثانية',
    hashtag: '#طبخ_سريع',
    prize: 750,
    participants: 0,
    trending: false,
    thumbnail: '👨‍🍳',
    createdAt: Date.now()
  }
];

let users = [];
let videos = [];
let stories = [];
let follows = [];
let blocks = [];
let likes = [];
let saves = [];
let giftsHistory = [];
let lives = new Map();
let notifications = [];
let messages = []; // المحادثات
let chatRooms = new Map(); // غرف الدردشة
let challenges = [...CHALLENGES];
let challengeEntries = []; // مشاركات التحديات

// بيانات تجريبية
const demoUsers = [
  {
    id: 'demo-1',
    username: 'نورة_ستار',
    email: 'noura@demo.com',
    password: '$2a$10$demo',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=noura',
    bio: '✨ صانعة محتوى | 300K متابع',
    followers: 125000,
    following: 450,
    videosCount: 156,
    likesCount: 2500000,
    balance: 5000,
    diamonds: 25000,
    canGoLive: true,
    isLive: false,
    isVerified: true,
    blockedUsers: []
  },
  {
    id: 'demo-2',
    username: 'أحمد_كوميدي',
    email: 'ahmed@demo.com',
    password: '$2a$10$demo',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ahmed',
    bio: '😂 كوميدي | ضحك معاي',
    followers: 89000,
    following: 230,
    videosCount: 89,
    likesCount: 1800000,
    balance: 3000,
    diamonds: 15000,
    canGoLive: true,
    isLive: false,
    isVerified: true,
    blockedUsers: []
  }
];

users.push(...demoUsers);

// ========== Middleware ==========

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: 'جلسة منتهية' });
  }
};

// ========== Auth Routes ==========

app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'اسم المستخدم موجود' });
  }
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'البريد موجود' });
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  
  const user = {
    id: uuidv4(),
    username,
    email,
    password: hashedPassword,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
    bio: '',
    followers: 0,
    following: 0,
    videosCount: 0,
    likesCount: 0,
    balance: 100, // رصيد ابتدائي
    diamonds: 0,
    canGoLive: false,
    isLive: false,
    isVerified: false,
    createdAt: Date.now(),
    blockedUsers: [],
    lastActive: Date.now()
  };
  
  users.push(user);
  
  const token = jwt.sign({ userId: user.id }, JWT_SECRET);
  res.json({ 
    success: true, 
    token, 
    user: { ...user, password: undefined }
  });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  const user = users.find(u => u.username === username);
  if (!user) return res.status(400).json({ error: 'مستخدم غير موجود' });
  
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ error: 'كلمة مرور خاطئة' });
  
  user.lastActive = Date.now();
  
  const token = jwt.sign({ userId: user.id }, JWT_SECRET);
  res.json({ 
    success: true, 
    token, 
    user: { ...user, password: undefined }
  });
});

// ========== User & Profile ==========

app.get('/api/me', auth, (req, res) => {
  const user = users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ error: 'غير موجود' });
  
  const myVideos = videos.filter(v => v.userId === user.id);
  
  const mySaves = saves
    .filter(s => s.userId === user.id)
    .map(s => videos.find(v => v.id === s.videoId))
    .filter(Boolean);
  
  const myLikes = likes
    .filter(l => l.userId === user.id)
    .map(l => videos.find(v => v.id === l.videoId))
    .filter(Boolean);
  
  // القصص النشطة
  const activeStories = stories.filter(s => {
    const userStories = stories.filter(us => us.userId === s.userId);
    return Date.now() - userStories[userStories.length - 1]?.createdAt < STORY_DURATION;
  });
  
  res.json({
    ...user,
    password: undefined,
    videos: myVideos,
    saved: mySaves,
    liked: myLikes,
    stories: activeStories.filter(s => s.userId === user.id)
  });
});

app.post('/api/profile/update', auth, upload.single('avatar'), (req, res) => {
  const user = users.find(u => u.id === req.userId);
  const { bio, username } = req.body;
  
  if (bio !== undefined) user.bio = bio;
  if (username && !users.find(u => u.username === username && u.id !== req.userId)) {
    user.username = username;
  }
  if (req.file) {
    user.avatar = `/uploads/avatars/${req.file.filename}`;
  }
  
  res.json({ success: true, user: { ...user, password: undefined } });
});

app.get('/api/user/:id', auth, (req, res) => {
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'غير موجود' });
  
  const isBlocked = user.blockedUsers.includes(req.userId);
  if (isBlocked) return res.status(403).json({ error: 'محظور' });
  
  const hisVideos = videos.filter(v => v.userId === user.id);
  const isFollowing = follows.some(f => 
    f.followerId === req.userId && f.followingId === user.id
  );
  
  // قصص المستخدم
  const userStories = stories.filter(s => {
    const isHis = s.userId === user.id;
    const isActive = Date.now() - s.createdAt < STORY_DURATION;
    return isHis && isActive;
  });
  
  res.json({
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    bio: user.bio,
    followers: user.followers,
    following: user.following,
    videosCount: user.videosCount,
    likesCount: user.likesCount,
    isVerified: user.isVerified,
    isLive: user.isLive,
    canGoLive: user.canGoLive,
    videos: hisVideos,
    stories: userStories,
    isFollowing,
    lastActive: user.lastActive
  });
});

// ========== Stories (قصص) ==========

app.post('/api/stories', auth, upload.single('story'), (req, res) => {
  if (!req.file && !req.body.mediaUrl) {
    return res.status(400).json({ error: 'لا يوجد محتوى' });
  }
  
  const story = {
    id: uuidv4(),
    userId: req.userId,
    url: req.file ? `/uploads/stories/${req.file.filename}` : req.body.mediaUrl,
    type: req.body.type || 'image',
    caption: req.body.caption || '',
    views: [],
    createdAt: Date.now(),
    expiresAt: Date.now() + STORY_DURATION
  };
  
  stories.push(story);
  
  // إشعار للمتابعين
  const user = users.find(u => u.id === req.userId);
  const followerIds = follows
    .filter(f => f.followingId === req.userId)
    .map(f => f.followerId);
  
  followerIds.forEach(fid => {
    notifications.push({
      id: uuidv4(),
      userId: fid,
      type: 'story',
      fromUser: user.username,
      fromAvatar: user.avatar,
      storyId: story.id,
      read: false,
      createdAt: Date.now()
    });
  });
  
  res.json({ success: true, story });
});

app.get('/api/stories/feed', auth, (req, res) => {
  const followingIds = follows
    .filter(f => f.followerId === req.userId)
    .map(f => f.followingId);
  
  followingIds.push(req.userId); // قصصي أيضاً
  
  const activeStories = stories.filter(s => {
    const isFollowing = followingIds.includes(s.userId);
    const isActive = Date.now() - s.createdAt < STORY_DURATION;
    const notBlocked = !users.find(u => u.id === s.userId)?.blockedUsers.includes(req.userId);
    return isFollowing && isActive && notBlocked;
  });
  
  // تجميع حسب المستخدم
  const grouped = activeStories.reduce((acc, story) => {
    if (!acc[story.userId]) {
      const user = users.find(u => u.id === story.userId);
      acc[story.userId] = {
        user: user ? { ...user, password: undefined } : null,
        stories: [],
        hasUnseen: false
      };
    }
    acc[story.userId].stories.push(story);
    
    // التحقق من وجود قصص غير مشاهدة
    const seen = story.views.includes(req.userId);
    if (!seen) acc[story.userId].hasUnseen = true;
    
    return acc;
  }, {});
  
  res.json(Object.values(grouped));
});

app.post('/api/stories/:id/view', auth, (req, res) => {
  const story = stories.find(s => s.id === req.params.id);
  if (!story) return res.status(404).json({ error: 'غير موجود' });
  
  if (!story.views.includes(req.userId)) {
    story.views.push(req.userId);
  }
  
  res.json({ success: true });
});

// ========== Videos ==========

app.post('/api/upload', auth, upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'لا يوجد فيديو' });
  
  const video = {
    id: uuidv4(),
    userId: req.userId,
    url: `/uploads/videos/${req.file.filename}`,
    thumbnail: `/uploads/videos/${req.file.filename}.jpg`,
    description: req.body.description || '',
    sound: req.body.sound || 'original',
    challengeId: req.body.challengeId || null,
    likes: 0,
    comments: 0,
    shares: 0,
    views: 0,
    createdAt: Date.now()
  };
  
  videos.push(video);
  
  const user = users.find(u => u.id === req.userId);
  user.videosCount++;
  
  // إذا كان في تحدي
  if (video.challengeId) {
    challengeEntries.push({
      id: uuidv4(),
      challengeId: video.challengeId,
      videoId: video.id,
      userId: req.userId,
      votes: 0,
      createdAt: Date.now()
    });
    
    const challenge = challenges.find(c => c.id === video.challengeId);
    if (challenge) challenge.participants++;
  }
  
  // إشعار للمتابعين
  const followerIds = follows
    .filter(f => f.followingId === req.userId)
    .map(f => f.followerId);
  
  followerIds.forEach(fid => {
    notifications.push({
      id: uuidv4(),
      userId: fid,
      type: 'new-video',
      fromUser: user.username,
      fromAvatar: user.avatar,
      videoId: video.id,
      read: false,
      createdAt: Date.now()
    });
  });
  
  res.json({ success: true, video });
});

app.get('/api/feed', auth, (req, res) => {
  const user = users.find(u => u.id === req.userId);
  
  const feed = videos
    .filter(v => !user.blockedUsers.includes(v.userId))
    .map(v => ({
      ...v,
      user: users.find(u => u.id === v.userId),
      isLiked: likes.some(l => l.userId === req.userId && l.videoId === v.id),
      isSaved: saves.some(s => s.userId === req.userId && s.videoId === v.id)
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
  
  res.json(feed);
});

// ========== Social Actions ==========

app.post('/api/videos/:id/like', auth, (req, res) => {
  const existing = likes.find(l => 
    l.userId === req.userId && l.videoId === req.params.id
  );
  
  const video = videos.find(v => v.id === req.params.id);
  
  if (existing) {
    likes = likes.filter(l => l.id !== existing.id);
    video.likes--;
  } else {
    likes.push({
      id: uuidv4(),
      userId: req.userId,
      videoId: req.params.id,
      createdAt: Date.now()
    });
    video.likes++;
    
    const videoOwner = users.find(u => u.id === video.userId);
    videoOwner.likesCount++;
    
    notifications.push({
      id: uuidv4(),
      userId: video.userId,
      type: 'like',
      fromUser: users.find(u => u.id === req.userId).username,
      fromAvatar: users.find(u => u.id === req.userId).avatar,
      read: false,
      createdAt: Date.now()
    });
  }
  
  res.json({ success: true, liked: !existing });
});

app.post('/api/videos/:id/save', auth, (req, res) => {
  const existing = saves.find(s => 
    s.userId === req.userId && s.videoId === req.params.id
  );
  
  if (existing) {
    saves = saves.filter(s => s.id !== existing.id);
  } else {
    saves.push({
      id: uuidv4(),
      userId: req.userId,
      videoId: req.params.id,
      createdAt: Date.now()
    });
  }
  
  res.json({ success: true, saved: !existing });
});

app.post('/api/follow/:userId', auth, (req, res) => {
  const { userId } = req.params;
  const followerId = req.userId;
  
  if (followerId === userId) {
    return res.status(400).json({ error: 'لا تستطيع متابعة نفسك' });
  }
  
  const existing = follows.find(f => 
    f.followerId === followerId && f.followingId === userId
  );
  
  const follower = users.find(u => u.id === followerId);
  const following = users.find(u => u.id === userId);
  
  if (existing) {
    follows = follows.filter(f => f.id !== existing.id);
    follower.following--;
    following.followers--;
    return res.json({ following: false });
  }
  
  follows.push({
    id: uuidv4(),
    followerId,
    followingId: userId,
    createdAt: Date.now()
  });
  
  follower.following++;
  following.followers++;
  
  const reachedGoal = following.followers === REQUIRED_FOLLOWERS_FOR_LIVE;
  if (reachedGoal && !following.canGoLive) {
    following.canGoLive = true;
    notifications.push({
      id: uuidv4(),
      userId: following.id,
      type: 'goal-reached',
      message: 'وصلت 300 متابع! يمكنك البث المباشر الآن',
      read: false,
      createdAt: Date.now()
    });
  }
  
  notifications.push({
    id: uuidv4(),
    userId: following.id,
    type: 'follow',
    fromUser: follower.username,
    fromAvatar: follower.avatar,
    read: false,
    createdAt: Date.now()
  });
  
  res.json({ 
    following: true, 
    reachedGoal,
    target: { ...following, password: undefined }
  });
});

app.post('/api/block/:userId', auth, (req, res) => {
  const user = users.find(u => u.id === req.userId);
  const targetId = req.params.userId;
  
  if (!user.blockedUsers.includes(targetId)) {
    user.blockedUsers.push(targetId);
    follows = follows.filter(f => 
      !(f.followerId === req.userId && f.followingId === targetId)
    );
  }
  
  res.json({ success: true, blocked: user.blockedUsers });
});

// ========== Challenges (التحديات) ==========

app.get('/api/challenges', auth, (req, res) => {
  res.json(challenges.map(c => ({
    ...c,
    topEntries: challengeEntries
      .filter(e => e.challengeId === c.id)
      .sort((a, b) => b.votes - a.votes)
      .slice(0, 3)
      .map(e => ({
        ...e,
        video: videos.find(v => v.id === e.videoId),
        user: users.find(u => u.id === e.userId)
      }))
  })));
});

app.get('/api/challenges/:id', auth, (req, res) => {
  const challenge = challenges.find(c => c.id === req.params.id);
  if (!challenge) return res.status(404).json({ error: 'غير موجود' });
  
  const entries = challengeEntries
    .filter(e => e.challengeId === req.params.id)
    .sort((a, b) => b.votes - a.votes)
    .map(e => ({
      ...e,
      video: videos.find(v => v.id === e.videoId),
      user: users.find(u => u.id === e.userId),
      hasVoted: e.voters?.includes(req.userId)
    }));
  
  res.json({ ...challenge, entries });
});

app.post('/api/challenges/:id/vote', auth, (req, res) => {
  const { entryId } = req.body;
  const entry = challengeEntries.find(e => e.id === entryId);
  
  if (!entry) return res.status(404).json({ error: 'غير موجود' });
  
  if (!entry.voters) entry.voters = [];
  
  if (entry.voters.includes(req.userId)) {
    entry.voters = entry.voters.filter(id => id !== req.userId);
    entry.votes--;
  } else {
    entry.voters.push(req.userId);
    entry.votes++;
  }
  
  res.json({ success: true, votes: entry.votes });
});

// ========== Chat (المحادثات) ==========

app.get('/api/chats', auth, (req, res) => {
  const userChats = messages
    .filter(m => m.senderId === req.userId || m.receiverId === req.userId)
    .reduce((acc, msg) => {
      const otherId = msg.senderId === req.userId ? msg.receiverId : msg.senderId;
      if (!acc[otherId]) {
        acc[otherId] = {
          user: users.find(u => u.id === otherId),
          lastMessage: msg,
          unread: 0
        };
      }
      if (msg.receiverId === req.userId && !msg.read) {
        acc[otherId].unread++;
      }
      return acc;
    }, {});
  
  res.json(Object.values(userChats));
});

app.get('/api/chats/:userId', auth, (req, res) => {
  const chatMessages = messages
    .filter(m => 
      (m.senderId === req.userId && m.receiverId === req.params.userId) ||
      (m.senderId === req.params.userId && m.receiverId === req.userId)
    )
    .sort((a, b) => a.createdAt - b.createdAt);
  
  // تحديث كمقروءة
  chatMessages.forEach(m => {
    if (m.receiverId === req.userId) m.read = true;
  });
  
  res.json(chatMessages);
});

app.post('/api/chats/:userId', auth, (req, res) => {
  const { text, mediaUrl, mediaType } = req.body;
  
  const message = {
    id: uuidv4(),
    senderId: req.userId,
    receiverId: req

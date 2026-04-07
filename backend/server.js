const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

let inMemoryDoubts = [];
let inMemoryUsers = [];
let idCounter = 1;

function analyzeDoubt(doubtText, topic = '', deadline = '') {
  let urgencyScore = 0;
  let importanceScore = 0;
  let difficultyScore = 0;
  let dependencyScore = 0;
  let reasonLines = [];

  const textLower = (doubtText || '').toLowerCase();
  const topicLower = (topic || '').toLowerCase();
  const deadlineLower = (deadline || '').toLowerCase();

  const urgencyKeywords = ['exam', 'tomorrow', 'urgent', 'deadline', 'test', 'assignment', 'today'];
  if (urgencyKeywords.some(kw => textLower.includes(kw) || deadlineLower.includes(kw))) {
    urgencyScore = 100;
    reasonLines.push('- Urgent timeline detected (exam/deadline approaching).');
  } else if (deadline) {
    urgencyScore = 50;
    reasonLines.push('- Has a deadline, requiring moderate attention.');
  }

  const coreTopics = [
    'dsa',
    'dbms',
    'os',
    'system design',
    'recursion',
    'graphs',
    'trees',
    'dynamic programming',
    'architecture'
  ];

  if (coreTopics.some(kw => textLower.includes(kw) || topicLower.includes(kw))) {
    importanceScore = 100;
    reasonLines.push('- Core foundational topic spotted.');
  } else if (topic) {
    importanceScore = 50;
    reasonLines.push(`- Relates to specific topic: ${topic}.`);
  }

  const conceptualKeywords = ['concept', 'understand', 'logic', 'how', 'why', 'theory', 'architecture', 'polymorphism'];
  const syntaxKeywords = ['syntax', 'error', 'bug', 'compile', 'typo', 'semicolon'];

  if (conceptualKeywords.some(kw => textLower.includes(kw))) {
    difficultyScore = 100;
    reasonLines.push('- Conceptual difficulty requires deeper learning time.');
  } else if (syntaxKeywords.some(kw => textLower.includes(kw))) {
    difficultyScore = 20;
    reasonLines.push('- Looks like a syntax error or bug, likely quick to fix.');
  } else {
    difficultyScore = 50;
  }

  const blockKeywords = ['block', 'stuck', 'cannot proceed', 'dependent', 'prerequisite'];
  if (blockKeywords.some(kw => textLower.includes(kw))) {
    dependencyScore = 100;
    reasonLines.push('- Blocks understanding of subsequent concepts.');
  }

  const totalScore =
    urgencyScore * 0.4 +
    importanceScore * 0.3 +
    difficultyScore * 0.2 +
    dependencyScore * 0.1;

  let priorityLabel = 'Low';
  if (totalScore >= 70) priorityLabel = 'High';
  else if (totalScore >= 40) priorityLabel = 'Medium';

  if (reasonLines.length === 0) {
    reasonLines.push('- General query.');
  }

  return {
    score: totalScore,
    label: priorityLabel,
    reason: reasonLines.join('\n')
  };
}

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access Denied' });
  }

  jwt.verify(token, 'secret', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token expired or invalid' });
    }
    req.user = user;
    next();
  });
};

// helper: always return only visible, unsolved doubts
function getVisibleDoubts(user) {
  let doubts = inMemoryDoubts.filter(
    d => String(d.status || '').toLowerCase().trim() !== 'solved'
  );

  if (user.role === 'Learner') {
    doubts = doubts.filter(d => d.learnerId === user.id);
  }

  doubts.sort((a, b) => b.priorityScore - a.priorityScore);
  return doubts;
}

app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend working' });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ error: 'Email, password, and role are required' });
    }

    const existingUser = inMemoryUsers.find(
      u => u.email.toLowerCase() === email.toLowerCase()
    );

    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      id: String(Date.now()),
      email,
      password: hashedPassword,
      role
    };

    inMemoryUsers.push(newUser);

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = inMemoryUsers.find(
      u => u.email.toLowerCase() === (email || '').toLowerCase()
    );

    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, email: user.email },
      'secret',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        role: user.role,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/doubts', authenticateToken, (req, res) => {
  try {
    const doubts = req.body;

    if (!Array.isArray(doubts)) {
      return res.status(400).json({ error: 'Expected an array of doubts' });
    }

    const processed = doubts.map(d => {
      const analysis = analyzeDoubt(d.text, d.topic, d.deadline);

      return {
        _id: String(idCounter++),
        text: d.text || '',
        topic: d.topic || 'General',
        deadline: d.deadline || '',
        priorityScore: analysis.score,
        priorityLabel: analysis.label,
        reason: analysis.reason,
        status: 'pending',
        learnerId: req.user.id,
        learnerEmail: req.user.email,
        solutions: [],
        createdAt: new Date()
      };
    });

    inMemoryDoubts = [...inMemoryDoubts, ...processed];

    res.status(201).json({
      message: 'Doubts processed',
      doubts: getVisibleDoubts(req.user)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit doubts' });
  }
});

app.get('/api/doubts', authenticateToken, (req, res) => {
  try {
    res.json(getVisibleDoubts(req.user));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch doubts' });
  }
});

app.post('/api/doubts/:id/solutions', authenticateToken, (req, res) => {
  try {
    const { type, content } = req.body;

    if (req.user.role !== 'Professional') {
      return res.status(403).json({ error: 'Only professionals can add solutions' });
    }

    const doubt = inMemoryDoubts.find(d => d._id === req.params.id);

    if (!doubt) {
      return res.status(404).json({ error: 'Doubt not found' });
    }

    const newSolution = {
      type: type || 'text',
      content: content || '',
      professionalId: req.user.id,
      createdAt: new Date()
    };

    if (!doubt.solutions) {
      doubt.solutions = [];
    }

    doubt.solutions.push(newSolution);
    doubt.status = 'solved';
    doubt.solverId = req.user.id;
    doubt.solvedAt = new Date();

    console.log(`\n--- MOCK EMAIL ---
To: ${doubt.learnerEmail || 'Learner'}
Subject: Your doubt has been solved!
Body: Hello! A professional has responded to your doubt: "${doubt.text}".
Solution type: ${type}.
Go to your dashboard to view the details!
------------------\n`);

    res.status(201).json({
      message: 'Solution added and doubt marked as solved',
      solution: newSolution,
      doubts: getVisibleDoubts(req.user)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add solution' });
  }
});

app.delete('/api/doubts/:id', authenticateToken, (req, res) => {
  try {
    inMemoryDoubts = inMemoryDoubts.filter(d => d._id !== req.params.id);
    res.json({ message: 'Deleted', doubts: getVisibleDoubts(req.user) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete doubt' });
  }
});

app.delete('/api/doubts', authenticateToken, (req, res) => {
  try {
    inMemoryDoubts = [];
    res.json({ message: 'All cleared', doubts: [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear doubts' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
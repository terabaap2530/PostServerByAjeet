require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// Body parser for POST requests
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files (panel.html, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Default route → panel.html show karega
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'panel.html'));
});

// Dummy API for Lock
app.post('/api/lock', (req, res) => {
    const name = req.body.name;
    console.log(`Lock enabled for name: ${name}`);
    res.json({ ok: true, message: `Group name locked to ${name}` });
});

// Dummy API for Unlock
app.post('/api/unlock', (req, res) => {
    console.log("Lock disabled");
    res.json({ ok: true, message: "Group name lock disabled" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

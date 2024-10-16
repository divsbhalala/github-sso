const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();
const routes = require('./routes/githubRoutes'); // Define GitHub routes

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

const URL = process.env.MONGO_URI
// MongoDB Connection
mongoose.connect(URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
.catch(err => console.log(err));

// Routes
app.use('/api/github', routes);
app.get('/', (req, res)=>{
  return res.send('Ok');
});

app.get('/login', (req, res)=>{
  return res.redirect(`https://github.com/login/oauth/authorize?client_id=${ process.env.GITHUB_CLIENT_ID}&scope=repo,user`);
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

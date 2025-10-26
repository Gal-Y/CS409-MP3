// Get the packages we need
var express = require('express'),
    mongoose = require('mongoose'),
    bodyParser = require('body-parser');

// Read .env file
require('dotenv').config();

// Create our Express application
var app = express();

// Use environment defined port or 3000
var port = process.env.PORT || 3000;

// Connect to MongoDB if a connection string is provided
var mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
    console.warn('MONGODB_URI is not set. API routes will fail until a connection string is provided.');
} else {
    mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    }).then(function () {
        console.log('Connected to MongoDB');
    }).catch(function (err) {
        console.error('Failed to connect to MongoDB', err);
    });
}

// Allow CORS so that backend and frontend could be put on different servers
var allowCrossDomain = function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "POST, GET, PUT, DELETE, OPTIONS");
    next();
};
app.use(allowCrossDomain);

// Use the body-parser package in our application
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());

// Use routes as a module (see index.js)
require('./routes')(app);

// Start the server
app.listen(port);
console.log('Server running on port ' + port);

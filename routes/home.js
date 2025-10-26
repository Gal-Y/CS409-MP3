var express = require('express');
var apiUtils = require('../utils/api');

var router = express.Router();

router.get('/', function (req, res) {
    apiUtils.sendResponse(res, 200, 'Welcome to Llama.io Task API', {
        status: 'ready',
        theme: {
            primary: '#1F3C88',
            secondary: '#A9B3C1',
            neutral: '#F4F6FA'
        }
    });
});

module.exports = router;

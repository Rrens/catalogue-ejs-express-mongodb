const express = require('express')
const route = express.Router()

route.get('/users', (req, res) => {
    res.render('index', { title: 'homepage' })
    // res.send('testing')
})

module.exports = route
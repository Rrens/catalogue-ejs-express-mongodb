require('dotenv').config()
const express = require('express')
const mongoose = require('mongoose')
const session = require('express-session')
const multer = require('multer')
const Product = require('./models/product')
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs')
const User = require('./models/users')
const cookieParser = require('cookie-parser');

const app = express()
const port = process.env.PORT || 4000

// DATABASE CONNECTION
// mongoose.connect(process.env.DB_URL, { useNewUrlParser: true, useUnifiedTopology: true })
// const db = mongoose.connection
// db.on('error', (error) => console.log(error))
// db.once('open', () => console.log('Connected to database'))

mongoose.connect(process.env.DB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log('MongoDB Connection Error:', err));

app.use(express.urlencoded({ extended: false }))
app.use(express.json())
app.use(express.static('uploads'))
app.use(cookieParser());

app.use(session({
    secret: 'secret key',
    saveUninitialized: true,
    resave: false
}))

app.use((req, res, next) => {
    res.locals.message = req.session.message
    delete req.session.message
    return next()
})

app.set('view engine', 'ejs')

// AUTHENTICATION
// Validation Middleware
const registerValidation = [
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

const loginValidation = [
    body('email').isEmail().withMessage('Invalid email'),
    body('password').not().isEmpty().withMessage('Password is required'),
];

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

app.post('/register', registerValidation, validate, async (req, res) => {
    const { email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'User already exists' });
        }
        user = new User({ email, password });
        await user.save();
        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 3600 }, (err, token) => {
            if (err) throw err;
            // res.json({ token });
            res.redirect('/login');
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

app.post('/login', loginValidation, validate, async (req, res) => {
    const { email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        const payload = { user: { id: user.id } };
        // console.log(payload)

        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 3600 }, (err, token) => {
            if (err) throw err;
            res.json({ token });
        });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.cookie('token', token, { httpOnly: true, maxAge: 3600000 }); // 1 jam
        res.redirect('/admin/list');
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

app.get('/forgot-password', (req, res) => {
    res.render('page/forgot-password', { title: 'Forgot Password' });
});

app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: 'User not found' });
        }

        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        // Kirim token dalam respon JSON
        res.status(200).json({ msg: 'Token generated', token: token });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

app.get('/reset/:token', async (req, res) => {
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() },
        });
        if (!user) {
            return res.status(400).json({ msg: 'Password reset token is invalid or has expired' });
        }
        res.render('page/reset-password', { token: req.params.token });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

app.post('/reset/:token', async (req, res) => {
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() },
        });
        if (!user) {
            return res.status(400).json({ msg: 'Password reset token is invalid or has expired' });
        }
        user.password = req.body.password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();
        res.status(200).json({ msg: 'Password has been reset' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

app.get('/login', (req, res) => {
    res.render('page/login', { title: 'Login' })
})

app.get('/register', (req, res) => {
    res.render('page/register', { title: 'Login' })
})

app.get('/logout', (req, res) => {
    res.cookie('token', '')
    res.redirect('/login')
})

// app.use("/", require("./routes/route"))
app.get('/', async (req, res) => {
    try {
        const data = await Product.find().exec();
        res.render('page/index', { title: 'Homepage', data: data });
    } catch (err) {
        res.json({ message: err.message });
    }
})

// Upload Image
let storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname); // to avoid file name conflicts
    }
});

let upload = multer({ storage: storage }).single('image');

const authenticate = async (req, res, next) => {
    console.log(req.cookies.token)
    try {
        // Ambil token dari header Authorization
        const token = req.cookies.token

        if (!token) {
            return res.status(401).json({ msg: 'No token, authorization denied' });
        }

        // Verifikasi token
        const decoded = jwt.verify(token, process.env.JWT_SECRET); // JWT_SECRET diatur dalam environment variables
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({ msg: 'User not found' });
        }

        req.user = user; // Simpan pengguna ke objek request
        next(); // Lanjutkan ke rute berikutnya
    } catch (err) {
        console.error(err);
        res.status(401).json({ msg: 'Token is not valid' });
    }
};

app.use('/admin', authenticate, async (req, res, next) => {

    next();
});

// INSERT Product Into Database
app.post('/admin/add', upload, async (req, res) => {
    data = req.body;
    const product = new Product({
        name: data.name,
        description: data.description,
        price: data.price,
        unit: data.unit,
        stock: data.stock,
        image: req.file.filename
    })
    // return res.json(product)
    try {
        await product.save();
        req.session.message = {
            type: 'success',
            intro: 'Saved!',
            message: 'Product has been added successfully.'
        };
        res.redirect('/admin/list')
    } catch (error) {
        console.log('Error saving product:', err);
        res.json({ message: err.message, type: 'danger' });
    }
})

// UPDATE 
app.get('/admin/edit/:id', async (req, res) => {
    let id = req.params.id;
    try {
        const data = await Product.findById(id);
        res.render('page/edit-input', {
            title: 'Edit Product',
            data: data
        });
    } catch (err) {
        res.redirect('/admin/list');
    }
});

app.post('/admin/update/:id', upload, async (req, res) => {
    let id = req.params.id
    data = req.body;
    let new_image = ''
    if (req.file) {
        new_image = req.file.filename
        try {
            fs.unlinkSync(`./uploads/${req.body.old_image}`)
        } catch (err) {
            console.log(err)
        }
    } else {
        new_image = req.body.old_image
    }

    try {
        await Product.findByIdAndUpdate(id, {
            name: data.name,
            description: data.description,
            price: data.price,
            unit: data.unit,
            stock: data.stock,
            image: new_image // pastikan untuk menyimpan gambar baru atau gambar lama
        });

        req.session.message = {
            type: 'success',
            intro: 'Updated!',
            message: 'Product has been updated successfully.'
        };
        res.redirect('/admin/list');
    } catch (err) {
        res.json({ message: err.message, type: 'danger' });
    }
    // res.redirect('/admin/list');
})

// DELETE PRODUCT
app.get('/admin/delete/:id', async (req, res) => {
    let id = req.params.id;

    try {
        const result = await Product.findByIdAndDelete(id);

        if (result && result.image) {
            try {
                fs.unlinkSync(`./uploads/${result.image}`);
            } catch (error) {
                console.log(error);
            }
        }

        req.session.message = {
            type: 'info',
            message: 'Product deleted successfully'
        };

        res.redirect('/admin/list');
    } catch (err) {
        console.log(err);
        req.session.message = {
            type: 'danger',
            message: 'Failed to delete product'
        };
        res.redirect('/admin/list');
    }
});


// ADD DATA
app.get('/admin/add-data', (req, res) => {
    res.render('page/input', { title: 'Input' })
})

// LIST TABEL DATA
app.get('/admin/list', async (req, res) => {
    try {
        const data = await Product.find().exec();
        res.render('page/table', { title: 'Homepage', data: data });
    } catch (err) {
        res.json({ message: err.message });
    }
})

// DETAIL PRODUCT
app.get('/detail/:id', async (req, res) => {
    let id = req.params.id
    try {
        const data = await Product.findById(id)
        // return res.json(data.name)
        res.render('page/detail-product', { title: 'detail', data: data })

    } catch (error) {
        res.redirect('/')
    }
})



app.listen(port, () => {
    console.log(`Server Launch in http://localhost:${port}`)
})
require('dotenv').config()
const express = require('express')
const mongoose = require('mongoose')
const session = require('express-session')
const multer = require('multer')
const Product = require('./models/product')
const fs = require('fs')

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

app.get('/login', (req, res) => {
    res.render('page/login', { title: 'Login' })
})



app.listen(port, () => {
    console.log(`Server Launch in http://localhost:${port}`)
})
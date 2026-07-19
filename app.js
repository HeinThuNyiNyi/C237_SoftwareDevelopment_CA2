require('dotenv').config();

const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const fs = require('fs');
const path = require('path');
const pool = require('./config/database');
const Category = require('./Models/Category');
const Product = require('./Models/Product');
const Purchase = require('./Models/Purchase');
const Rating = require('./Models/Rating');
const { ratingUpload, uploadDirectory } = require('./middleware/ratingUpload');

const app = express();

// 启动时做一次轻量查询，尽早发现数据库配置或网络问题。
pool.query('SELECT 1')
    .then(() => console.log('Connected to database'))
    .catch((error) => console.error('Error connecting to database:', error.message));

app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000
    }
}));

app.use(flash());
app.set('view engine', 'ejs');

// 登录模块完成后优先使用 session.user.id；同时兼容目前评分代码使用的 session.userId。
function getLoggedInUserId(req) {
    const parsedUserId = Number(req.session.user?.id || req.session.userId);
    return Number.isInteger(parsedUserId) && parsedUserId > 0 ? parsedUserId : null;
}

function toItemView(product) {
    return {
        id: product.id,
        name: product.name,
        price: Number(product.price),
        category: product.categoryName || 'Other',
        image: product.image ? `/images/${product.image}` : null
    };
}

async function decorateProductsWithRatings(products) {
    const summaries = await Rating.getSummariesByProductIds(products.map((product) => product.id));
    return products.map((product) => ({
        ...product,
        ratingSummary: summaries.get(Number(product.id)) || {
            averageRating: 0,
            reviewCount: 0
        }
    }));
}

// 写评价必须使用已经完成过该商品交易的买家账户。
async function requirePurchasedProduct(req, res, next) {
    const productId = Number(req.params.id);
    const buyerId = getLoggedInUserId(req);

    if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).send('Invalid product ID');
    }

    if (!buyerId) {
        req.flash('error', 'Sign in with the account that purchased this item to write a review');
        return res.redirect(`/details/${productId}/ratings`);
    }

    try {
        const purchase = await Purchase.findCompletedPurchase(buyerId, productId);
        if (!purchase) {
            req.flash('error', 'Only verified buyers can review this item');
            return res.redirect(`/details/${productId}/ratings`);
        }

        req.ratingBuyerId = buyerId;
        req.ratingPurchase = purchase;
        return next();
    } catch (error) {
        return next(error);
    }
}

function getUploadedFiles(req) {
    return [
        ...(req.files?.images || []),
        ...(req.files?.videos || [])
    ];
}

function removeUploadedFiles(files) {
    for (const file of files) {
        fs.unlink(file.path, () => {});
    }
}

function removeStoredMedia(mediaPaths) {
    for (const mediaPath of mediaPaths) {
        const fileName = path.basename(mediaPath);
        fs.unlink(path.join(uploadDirectory, fileName), () => {});
    }
}

// ==================== Thiha Aung 的商品路由（Promise 版本） ====================

app.get('/', async (req, res, next) => {
    try {
        const [rawProducts, categories] = await Promise.all([
            Product.getRecentApproved(3),
            Category.getAll()
        ]);
        const products = await decorateProductsWithRatings(rawProducts);
        res.render('index', { products, categories });
    } catch (error) {
        next(error);
    }
});

app.get('/browse', async (req, res, next) => {
    const categoryId = req.query.category || '';
    const search = req.query.q?.trim() || '';

    try {
        const [rawProducts, categories] = await Promise.all([
            Product.getApprovedProducts({ categoryId, search }),
            Category.getAll()
        ]);
        const products = await decorateProductsWithRatings(rawProducts);
        res.render('browse', {
            products,
            categories,
            selectedCategory: categoryId,
            search,
            success: req.flash('success')[0] || null,
            error: req.flash('error')[0] || null
        });
    } catch (error) {
        next(error);
    }
});

app.get('/products/:id', async (req, res, next) => {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).send('Invalid product ID');
    }

    try {
        const product = await Product.getById(productId);
        if (!product) {
            return res.status(404).send('Product not found');
        }

        const ratingSummary = await Rating.getSummaryByProductId(productId);
        return res.render('productDetails', { product, ratingSummary });
    } catch (error) {
        return next(error);
    }
});

app.get('/sell', async (req, res, next) => {
    try {
        const categories = await Category.getAll();
        res.render('sell', {
            categories,
            success: req.flash('success')[0] || null,
            error: req.flash('error')[0] || null
        });
    } catch (error) {
        next(error);
    }
});

app.post('/sell', async (req, res, next) => {
    const { name, categoryId, description, price, condition, quantity, image, contactInfo } = req.body;
    // 团队登录功能尚未合并时，沿用 Thiha-Aung 数据库中已存在的测试卖家 id=2。
    const sellerId = getLoggedInUserId(req) || 2;

    if (!name?.trim() || !categoryId || Number(price) < 0 || Number(quantity) < 1) {
        req.flash('error', 'Please complete all required product fields');
        return res.redirect('/sell');
    }

    try {
        await Product.create({
            sellerId,
            categoryId: Number(categoryId),
            name: name.trim(),
            description: description?.trim() || null,
            price: Number(price),
            condition,
            quantity: Number(quantity),
            image: image?.trim() || null,
            contactInfo: contactInfo?.trim() || null
        });
        req.flash('success', 'Product submitted for admin approval');
        return res.redirect('/browse');
    } catch (error) {
        return next(error);
    }
});

app.get('/admin', async (req, res, next) => {
    try {
        const pendingProducts = await Product.getPendingProducts();
        res.render('admin/index', { pendingProducts });
    } catch (error) {
        next(error);
    }
});

app.post('/admin/products/:id/approve', async (req, res, next) => {
    try {
        await Product.approve(Number(req.params.id));
        res.redirect('/admin');
    } catch (error) {
        next(error);
    }
});

app.post('/admin/products/:id/reject', async (req, res, next) => {
    try {
        await Product.reject(Number(req.params.id), req.body.reason?.trim() || 'No reason provided');
        res.redirect('/admin');
    } catch (error) {
        next(error);
    }
});

// ==================== 本地评分路由 ====================

// 点击商品评分只进入公开评价列表，不会直接打开写评价表单。
app.get('/details/:id/ratings', async (req, res, next) => {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).send('Invalid product ID');
    }

    try {
        const product = await Product.getById(productId);
        if (!product) {
            return res.status(404).send('Product not found');
        }

        const buyerId = getLoggedInUserId(req);
        const [ratingSummary, reviews] = await Promise.all([
            Rating.getSummaryByProductId(productId),
            Rating.getPublicReviewsByProductId(productId)
        ]);

        let canReview = false;
        let hasExistingReview = false;
        if (buyerId) {
            const [purchase, existingRating] = await Promise.all([
                Purchase.findCompletedPurchase(buyerId, productId),
                Rating.findByProductAndBuyer(productId, buyerId)
            ]);
            canReview = Boolean(purchase);
            hasExistingReview = Boolean(existingRating);
        }

        return res.render('details/ratings', {
            item: toItemView(product),
            itemId: productId,
            ratingSummary,
            reviews,
            isLoggedIn: Boolean(buyerId),
            canReview,
            hasExistingReview,
            success: req.flash('success')[0] || null,
            error: req.flash('error')[0] || null
        });
    } catch (error) {
        return next(error);
    }
});

app.get('/details/:id/rating', (req, res) => {
    res.redirect(301, `/details/${req.params.id}/ratings`);
});

app.get('/details/:id/rating/new', requirePurchasedProduct, async (req, res, next) => {
    const productId = Number(req.params.id);

    try {
        const [product, existingRating] = await Promise.all([
            Product.getById(productId),
            Rating.findByProductAndBuyer(productId, req.ratingBuyerId)
        ]);
        if (!product) {
            return res.status(404).send('Product not found');
        }

        return res.render('details/rating', {
            pageTitle: existingRating ? 'Update your review' : 'Share your experience',
            item: toItemView(product),
            itemId: productId,
            selectedRating: existingRating?.rating || 0,
            comment: existingRating?.comment || '',
            isAnonymous: existingRating?.is_anonymous || false,
            existingMedia: existingRating?.media || [],
            success: null,
            error: req.flash('error')[0] || null
        });
    } catch (error) {
        return next(error);
    }
});

app.post(
    '/details/:id/rating/new',
    requirePurchasedProduct,
    ratingUpload,
    async (req, res, next) => {
        const productId = Number(req.params.id);
        const rating = Number(req.body.rating);
        const comment = req.body.comment?.trim() || null;
        const isAnonymous = req.body.isAnonymous === '1';
        const removeMedia = req.body.removeMedia === '1';
        const mediaFiles = getUploadedFiles(req);

        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            removeUploadedFiles(mediaFiles);
            req.flash('error', 'Please choose a rating from 1 to 5 stars');
            return res.redirect(`/details/${productId}/rating/new`);
        }

        if (comment && comment.length > 500) {
            removeUploadedFiles(mediaFiles);
            req.flash('error', 'Your review must be 500 characters or fewer');
            return res.redirect(`/details/${productId}/rating/new`);
        }

        try {
            const result = await Rating.upsert({
                productId,
                buyerId: req.ratingBuyerId,
                sellerId: req.ratingPurchase.seller_id,
                rating,
                comment,
                isAnonymous,
                mediaFiles,
                replaceMedia: mediaFiles.length > 0 || removeMedia
            });

            removeStoredMedia(result.oldMediaPaths);
            req.flash('success', 'Your rating has been saved');
            return res.redirect(`/details/${productId}/ratings`);
        } catch (error) {
            removeUploadedFiles(mediaFiles);
            return next(error);
        }
    }
);

app.use((req, res) => {
    res.status(404).send('Error: Page not found.');
});

app.use((err, req, res, next) => {
    console.error(err.stack);

    if (err.name === 'MulterError') {
        return res.status(400).send(
            err.code === 'LIMIT_FILE_SIZE'
                ? 'Each upload must be 25 MB or smaller.'
                : 'The uploaded files could not be processed.'
        );
    }

    if (err.message === 'Only image and video files are allowed') {
        return res.status(400).send(err.message);
    }

    return res.status(500).send('Error: Something went wrong on the server.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
});

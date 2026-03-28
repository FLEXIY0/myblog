const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'posts.json');

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// Раздаем статические файлы (наш фронтенд)
app.use(express.static(__dirname));

// Функция чтения базы данных
const readData = () => {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify([]));
    }
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
};

// Функция записи в базу данных
const writeData = (data) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

// 1. Получение всех постов
app.get('/api/posts', (req, res) => {
    const posts = readData();
    res.json(posts);
});

// 2. Создание нового поста
app.post('/api/posts', (req, res) => {
    const { text } = req.body;
    if (!text) {
        return res.status(400).json({ error: 'Text is required' });
    }

    const posts = readData();
    const newPost = {
        id: Date.now(),
        createdAt: new Date().toISOString(),
        updatedAt: null,
        versions: [{                      // Массив версий, начиная с первой
            text,
            timestamp: new Date().toISOString()
        }]
    };

    posts.unshift(newPost);
    writeData(posts);
    res.status(201).json(newPost);
});

// 3. Добавление новой версии к посту (редактирование)
app.put('/api/posts/:id', (req, res) => {
    const { id } = req.params;
    const { text } = req.body;

    if (!text) {
        return res.status(400).json({ error: 'Text is required' });
    }

    const posts = readData();
    const postIndex = posts.findIndex(p => p.id === parseInt(id));

    if (postIndex === -1) {
        return res.status(404).json({ error: 'Post not found' });
    }

    // Проверяем текст последней текущей версии, чтобы не создавать дубликаты
    const latestVersion = posts[postIndex].versions[posts[postIndex].versions.length - 1].text;
    
    if (latestVersion !== text) {
        posts[postIndex].versions.push({
            text,
            timestamp: new Date().toISOString()
        });
        posts[postIndex].updatedAt = new Date().toISOString();
        writeData(posts);
    }

    res.json(posts[postIndex]);
});

// 4. Возврат к первой (нулевой) версии
app.post('/api/posts/:id/revert', (req, res) => {
    const { id } = req.params;
    
    const posts = readData();
    const postIndex = posts.findIndex(p => p.id === parseInt(id));

    if (postIndex === -1) {
        return res.status(404).json({ error: 'Post not found' });
    }

    const post = posts[postIndex];
    if (post.versions.length <= 1) {
        return res.status(400).json({ error: 'No edits to revert' });
    }

    // Берем текст из самого первого элемента массива версий
    const originalText = post.versions[0].text;
    const latestVersion = post.versions[post.versions.length - 1].text;

    // Добавляем этот текст в историю как НОВУЮ версию, чтобы ничего не терять
    if (latestVersion !== originalText) {
        post.versions.push({
            text: originalText,
            timestamp: new Date().toISOString(),
            isRevert: true // пометим, что это был откат
        });
        post.updatedAt = new Date().toISOString();
        writeData(posts);
    }

    res.json(post);
});

// 5. Удаление поста
app.delete('/api/posts/:id', (req, res) => {
    const { id } = req.params;
    let posts = readData();
    const postIndex = posts.findIndex(p => p.id === parseInt(id));

    if (postIndex === -1) {
        return res.status(404).json({ error: 'Post not found' });
    }

    posts.splice(postIndex, 1);
    writeData(posts);
    res.json({ message: 'Post deleted' });
});

// 6. Загрузка картинки
app.post('/api/upload', (req, res) => {
    const { filename, base64 } = req.body;
    if (!filename || !base64) {
        return res.status(400).json({ error: 'Missing data' });
    }
    
    const imagesDir = path.join(__dirname, 'images');
    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir);
    
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
    const filepath = path.join(imagesDir, filename);
    
    fs.writeFileSync(filepath, base64Data, 'base64');
    
    res.json({ url: `images/${filename}` });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

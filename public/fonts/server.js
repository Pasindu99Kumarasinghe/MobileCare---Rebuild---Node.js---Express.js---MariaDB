const express = require('express');
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));

//Define routes here
app.get('/',(req, res) => {
    res.send('Hello World!');
});

app.listen(port, () => {
    console.log('Server running at http://localhost:${port}/');
});
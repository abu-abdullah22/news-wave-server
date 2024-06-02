const express = require('express')
const app = express() ;
const cors = require("cors");
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('newswavingggg')
})

app.listen(port, () => {
  console.log(`it's waving baby on port ${port}`)
})
const express = require("express");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 5000;
require("dotenv").config();
const jwt = require("jsonwebtoken");
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const subscriptionScheduler = require('./subscriptionScheduler'); 
app.use(cors({
  origin: ['http://localhost:5173']
}));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gvqow0e.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const userCollection = client.db("newswaveDB").collection("users");
    const publisherCollection = client.db("newswaveDB").collection("publishers");
    const articleCollection = client.db("newswaveDB").collection("articles");

    //jwt related apis
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
      });
      res.send({ token });
    });

    //middlewares
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    //user related api
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get('/users/:email',verifyToken, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const result = await userCollection.findOne(filter);
      res.send(result);
    });

    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    //publisher related api
    app.post("/publishers", verifyToken, verifyAdmin, async (req, res) => {
      const publisher = req.body;
      const result = await publisherCollection.insertOne(publisher);
      res.send(result);
    });

    app.get('/publishers', async (req, res) => {
      const result = await publisherCollection.find().toArray();
      res.send(result);
    });

    //article related api
    app.post('/articles', async (req, res) => {
      const article = req.body;
      const result = await articleCollection.insertOne(article);
      res.send(result);
    });

    app.get('/articles', async (req, res) => {
      const result = await articleCollection.find().toArray();
      res.send(result);
    });

    app.get('/allArticles', async (req, res) => {
      const { publisher, tags, title } = req.query;
      let filter = { status: 'approved' };

      if (publisher) {
        filter.publisher = publisher;
      }
      if (tags) {
        filter.tags = { $in: tags.split(',') };
      }
      if (title) {
        filter.title = { $regex: title, $options: 'i' };
      }

      const result = await articleCollection.find(filter).toArray();
      res.send(result);
    });

    app.get('/articles/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const filter = { author_email: email };
      const result = await articleCollection.find(filter).toArray();
      res.send(result);
    });

    app.get('/premiumArticles', verifyToken, async (req, res) => {
      const filter = { premium: true };
      const result = await articleCollection.find(filter).toArray();
      res.send(result);
    });

    app.get('/article/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await articleCollection.findOne(filter);
      res.send(result);
    });

    app.put('/update/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const articleData = req.body;
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...articleData,
        }
      };
      const result = await articleCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    app.patch('/articles/:id/incrementViewCount', verifyToken, async (req, res) => {
      const { id } = req.params;
      const articleId = new ObjectId(id);
      const updateResult = await articleCollection.updateOne(
        { _id: articleId },
        { $inc: { viewCount: 1 } }
      );
      const article = await articleCollection.findOne({ _id: articleId });
      res.status(200).send(article);
    });

    app.get('/trendingArticles', async (req, res) => {
      const articles = await articleCollection.find().sort({ viewCount: -1 }).limit(6).toArray();
      res.status(200).json(articles);
    });

    app.delete('/delete/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await articleCollection.deleteOne(filter);
      res.send(result);
    });

    //admin
    app.patch(
      "/articles/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            status: "approved",
          },
        };
        const result = await articleCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    app.patch('/articles/admin/decline/:id', verifyToken, verifyAdmin, async (req, res) => {
      const articleId = req.params.id;
      const { declineReason } = req.body;
      const filter = { _id: new ObjectId(articleId) };
      const updatedDoc = {
        $set: {
          status: 'declined',
          declineReason: declineReason
        }
      };
      const result = await articleCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.patch('/articles/admin/premium/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          premium: true,
        }
      };
      const result = await articleCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.delete('/articles/admin/delete/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await articleCollection.deleteOne(filter);
      res.send(result);
    });

    // payment apis
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card'],
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      });
    });

    app.patch("/users/premium/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const { subscriptionPlan, premiumExpiry } = req.body;

      const filter = { email: email };
      const updateDoc = {
        $set: {
          subscriptionPlan: subscriptionPlan,
          isPremium: true,
          premiumExpiry: new Date(premiumExpiry),
        },
      };

      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("newswavingggg");
});

app.listen(port, () => {
  console.log(`it's waving baby on port ${port}`);
});

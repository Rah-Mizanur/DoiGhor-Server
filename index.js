require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const admin = require('firebase-admin')
const port = process.env.PORT || 3000
const decoded = Buffer.from(process.env.Fb_Key, 'base64').toString(
  'utf-8'
)
const serviceAccount = JSON.parse(decoded)
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const app = express()
// middleware
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://doighor.web.app',
    ],
    credentials: true,
    optionSuccessStatus: 200,
  })
)
app.use(express.json())

// jwt middlewares
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(' ')[1]
  console.log(token)
  if (!token) return res.status(401).send({ message: 'Unauthorized Access!' })
  try {
    const decoded = await admin.auth().verifyIdToken(token)
    req.tokenEmail = decoded.email
    console.log(decoded)
    next()
  } catch (err) {
    console.log(err)
    return res.status(401).send({ message: 'Unauthorized Access!', err })
  }
}

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})
async function run() {
  try {
    const db = client.db('doighor')
    const ordersCollection = db.collection('orders')
    const usersCollection = db.collection('users')
    const deletedOrderCollection = db.collection('deletedOrder')
        // save or update a user in db
    app.post('/user', async (req, res) => {
      const userData = req.body
      userData.created_at = new Date().toISOString()
      userData.last_loggedIn = new Date().toISOString()
      userData.role = 'customer'

      const query = {
        email: userData.email,
      }

      const alreadyExists = await usersCollection.findOne(query)
      console.log('User Already Exists---> ', !!alreadyExists)

      if (alreadyExists) {
        console.log('Updating user info......')
        const result = await usersCollection.updateOne(query, {
          $set: {
            last_loggedIn: new Date().toISOString(),
          },
        })
        return res.send(result)
      }

      console.log('Saving new user info......')
      const result = await usersCollection.insertOne(userData)
      res.send(result)
    })

      app.get('/user/role', verifyJWT, async (req, res) => {
      const result = await usersCollection.findOne({ email: req.tokenEmail })
      res.send({ role: result?.role })
    })

    app.post('/orders',verifyJWT,async(req,res)=>{
      const orderData = req.body;
      orderData.orderTime = new Date()
      orderData.status = 'pending'
      const result = ordersCollection.insertOne(orderData)
      res.send(result)
    })
    app.get('/orders',verifyJWT,async(req,res)=>{
       const searchQuery = req.query.search || '';
      const result = await ordersCollection.find({
        $or:[
          {
            customerName :{ $regex: searchQuery, $options: 'i' }
          }
        ]
      }).toArray()
      res.send(result)
    })
     app.get("/order-details/:id", async (req, res) => {
      const { id } = req.params;
      const result = await ordersCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

        app.patch("/update-order", verifyJWT, async (req, res) => {
      const { id, status,totalPay,seller} = req.body;
      const filter = { _id: new ObjectId(id) };
      const time = new Date()
      const updateDoc = {
        $set: {
          totalPay : totalPay,
          status: status,
          seller : seller,
          sellTime : time ,
        },
      };
      const result = await ordersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });


    // delete order and save arcive 

    app.post("/delete-request", verifyJWT, async (req, res) => {
  try {
    const { id, sale } = req.body;

    // Validate ID
    if (!id || !ObjectId.isValid(id)) {
      return res.status(400).send({ error: "Invalid request ID" });
    }

    // Prepare archive data
    const archiveData = {
      ...sale,           // include all original fields
      originalId: id,       // keep track of original _id
      deletedAt: new Date(), // deletion timestamp
    };

    // Remove _id to avoid conflicts
    delete archiveData._id;

    // Insert full request data into deleted collection
    const result = await deletedOrderCollection.insertOne(archiveData);

    // Delete the original request from main collection
    await ordersCollection.deleteOne({ _id: new ObjectId(id) });
    // console.log(archiveData)
    console.log("Archived and deleted:", result);
    res.send({ success: true, result });
  } catch (err) {
    console.error("Delete request error:", err);
    res.status(500).send({ error: "Failed to delete request" });
  }
});
    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from Server..')
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})

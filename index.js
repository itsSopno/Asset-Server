require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const admin = require('firebase-admin')


const port = process.env.PORT || 3000

// ------------------ Firebase Admin ------------------
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf-8')
const serviceAccount = JSON.parse(decoded)

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const app = express()

// ------------------ Middleware ------------------
app.use(
  cors({
    origin: process.env.CLIENT_DOMAIN,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PATCH", "DELETE", "PUT", "OPTIONS"],
  })
);

// Handle preflight requests explicitly (Express 5 compatible)
app.options('/{*path}', cors({
  origin: process.env.CLIENT_DOMAIN,
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
  methods: ["GET", "POST", "PATCH", "DELETE", "PUT", "OPTIONS"],
}));

app.use(express.json());
// ------------------ JWT Verify ------------------
const verifyJWT = async (req, res, next) => {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).send({ message: "Unauthorized!" })

  const token = auth.split(" ")[1]
  try {
    const decoded = await admin.auth().verifyIdToken(token)
    req.tokenEmail = decoded.email
    next()
  } catch (err) {
    return res.status(401).send({ message: "Invalid Token" })
  }
}

// ------------------ MongoDB ------------------
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
})

async function run() {
  try {
    const db = client.db('plantsDB')

    // ------------------ Collections ------------------
    const plantsCollection = db.collection('plants')
    const ordersCollection = db.collection('orders')
    const usersCollection = db.collection('users')
    const sellerRequestsCollection = db.collection('sellerRequests')
    const permissionRequestsCollection = db.collection('permissionRequests')
    const employeesCollection = db.collection('employees')
    const hrCollection = db.collection('hr')
    const plansCollection = db.collection('plans')
    const paymentsCollection = db.collection('payments')
    const employeeAffiliationsCollection = db.collection('employeeAffiliations')
    const assignedAssetsCollection = db.collection('assignedAssets')
const myInventoryCollection = db.collection('inventory')
const inventoryHistoryCollection = db.collection('inventoryHistory')
const teamcollection = db.collection('team')
    // ------------------ Role Middlewares ------------------
    const verifyADMIN = async (req, res, next) => {
      const user = await usersCollection.findOne({ email: req.tokenEmail })
      if (user?.role !== 'hr') return res.status(403).send({ message: 'Admin Only!' })
      next()
    }

    const verifyHR = async (req, res, next) => {
      const user = await usersCollection.findOne({ email: req.tokenEmail })
      if (user?.role !== 'hr') return res.status(403).send({ message: 'HR access only!' })
      next()
    }

    const verifyEmployee = async (req, res, next) => {
      const user = await usersCollection.findOne({ email: req.tokenEmail })
      if (user?.role !== 'employee') return res.status(403).send({ message: 'Employee access only!' })
      next()
    }

    const verifyHRorEmployee = async (req, res, next) => {
      const user = await usersCollection.findOne({ email: req.tokenEmail })
      if (user?.role === 'hr' || user?.role === 'employee') return next()
      return res.status(403).send({ message: 'Forbidden!' })
    }
app.post('/plants', verifyJWT, verifyHR, async (req, res) => {
      const result = await plantsCollection.insertOne(req.body)
      res.send(result)
    })

    app.get('/plants', async (req, res) => {
      const result = await plantsCollection.find().toArray()
      res.send(result)
    })

    app.get('/plants/:id', async (req, res) => {
      const result = await plantsCollection.findOne({
        _id: new ObjectId(req.params.id),
      })
      res.send(result)
    })
app.post(
  '/employee-affiliations',
  verifyJWT,
  verifyHR,
  async (req, res) => {
    try {
      const { employeeEmail, employeeName, companyLogo } = req.body

      const hr = await usersCollection.findOne({ email: req.tokenEmail })

      if (!hr) {
        return res.status(404).send({ message: 'HR not found' })
      }


      const exists = await employeeAffiliationsCollection.findOne({
        employeeEmail,
        hrEmail: hr.email,
        status: 'active',
      })

      if (exists) {
        return res
          .status(409)
          .send({ message: 'Employee already affiliated' })
      }


      if (hr.currentEmployees >= hr.packageLimit) {
        return res
          .status(403)
          .send({ message: 'Employee limit reached. Upgrade package.' })
      }

      // ---------- Employee affiliation doc ----------
      const affiliationDoc = {
        employeeEmail,
        employeeName,
        hrEmail: hr.email,
        companyName: hr.companyName,
        companyLogo,
        affiliationDate: new Date(),
        status: 'active',
      }

      // ---------- Employee inventory doc ----------
      const inventoryDoc = {
        employeeEmail,
        employeeName,
        hrEmail: hr.email,
        companyName: hr.companyName,
        items: [],
        createdAt: new Date(),
      }

      // ---------- TRANSACTION (important) ----------
      const session = client.startSession()

      let affiliationResult, inventoryResult

      await session.withTransaction(async () => {
        affiliationResult = await employeeAffiliationsCollection.insertOne(
          affiliationDoc,
          { session }
        )

        inventoryResult = await myInventoryCollection.insertOne(
          inventoryDoc,
          { session }
        )

        await usersCollection.updateOne(
          { email: hr.email },
          { $inc: { currentEmployees: 1 } },
          { session }
        )
      })

      session.endSession()

      res.send({
        message: 'Employee affiliated & inventory created',
        affiliationId: affiliationResult.insertedId,
        inventoryId: inventoryResult.insertedId,
      })
    } catch (error) {
      console.error(error)
      res.status(500).send({ message: 'Failed to affiliate employee' })
    }
  }
)

app.get('/employee-affiliations/check', verifyJWT, async (req, res) => {
  const { employeeEmail, hrEmail } = req.query

  const affiliation = await employeeAffiliationsCollection.findOne({
    employeeEmail,
    hrEmail,
    status: 'active'
  })

  res.send({ affiliated: !!affiliation })
})
app.get('/employee-affiliations', verifyJWT, verifyHR, async (req, res) => {
  try {
    const hrEmail = req.tokenEmail

    const result = await employeeAffiliationsCollection
      .find({ hrEmail })
      .sort({ affiliationDate: -1 })
      .toArray()

    res.send(result)
  } catch (error) {
    res.status(500).send({ message: 'Failed to fetch employee affiliations' })
  }
})
app.get(
  '/employee-affiliations',
  verifyJWT,
  verifyEmployee,
  async (req, res) => {
    try {
      const employeeEmail = req.tokenEmail

      /**
       * affiliation collection structure assumed:
       * {
       *   employeeEmail,
       *   employeeName,
       *   companyName,
       *   hrEmail,
       *   affiliationDate,
       *   status: 'active' | 'inactive'
       * }
       */

      const affiliations = await employeeAffiliationsCollection
        .find({ employeeEmail })
        .sort({ affiliationDate: -1 })
        .toArray()

      res.send(affiliations)
    } catch (error) {
      console.error(error)
      res.status(500).send({ message: 'Failed to fetch employee affiliations' })
    }
  }
)
app.get('/inventory', verifyJWT, async (req, res) => {
  const inventory = await myInventoryCollection.findOne({
    employeeEmail: req.tokenEmail,
  })
  res.send(inventory)
})

app.post('/assign-asset', verifyJWT, verifyHR, async (req, res) => {
  const { assetId, employeeEmail } = req.body

  const hr = await usersCollection.findOne({ email: req.tokenEmail })
  if (!hr) return res.status(404).send({ message: 'HR not found' })

  // affiliation check
  const affiliation = await employeeAffiliationsCollection.findOne({
    employeeEmail,
    hrEmail: hr.email,
    status: 'active',
  })
  if (!affiliation) {
    return res.status(403).send({ message: 'Employee not affiliated' })
  }

  const asset = await plantsCollection.findOne({ _id: new ObjectId(assetId) })
  if (!asset || asset.availableQuantity <= 0) {
    return res.status(400).send({ message: 'Asset not available' })
  }

  const session = client.startSession()

  try {
    await session.withTransaction(async () => {
    
      await assignedAssetsCollection.insertOne(
        {
          assetId: asset._id,
          assetName: asset.productName,
          assetImage: asset.productImage,
          assetType: asset.productType,
          employeeEmail,
          employeeName: affiliation.employeeName,
          hrEmail: hr.email,
          companyName: hr.companyName,
          assignmentDate: new Date(),
          status: 'assigned',
        },
        { session }
      )

    
      await myInventoryCollection.updateOne(
        { employeeEmail },
        {
          $push: {
            items: {
              assetId: asset._id,
              assetName: asset.productName,
              assetType: asset.productType,
               companyName: hr.companyName,
                hrEmail: hr.email,
              assignedAt: new Date(),
            },
          },
        },
        { session }
      )

    
      await plantsCollection.updateOne(
        { _id: asset._id },
        { $inc: { availableQuantity: -1 } },
        { session }
      )

     
      await inventoryHistoryCollection.insertOne(
        {
          employeeEmail,
          assetId: asset._id,
          assetName: asset.productName,
          action: 'ASSIGNED',
          performedBy: hr.email,
           hrEmail: hr.email,
              companyName: hr.companyName,
          date: new Date(),
        },
        { session }
      )
   await teamcollection.updateOne(
  {
      employeeEmail,
    hrEmail: hr.email,
    companyName: hr.companyName
  },
  {
    $setOnInsert: {
      hrEmail: hr.email,
      companyName: hr.companyName,
      date: new Date()
    }
  },
  { upsert: true, session }
)


    })

    res.send({ message: 'Asset assigned & inventory updated' })
  } catch (err) {
    console.error(err)
    res.status(500).send({ message: 'Assign failed' })
  } finally {
    session.endSession()
  }
})
app.post('/return-asset', verifyJWT, verifyEmployee, async (req, res) => {
  try {
    const { assetId } = req.body
    const employeeEmail = req.tokenEmail

    if (!assetId) {
      return res.status(400).send({ message: 'assetId missing' })
    }

  
    const assigned = await assignedAssetsCollection.findOne({
      assetId: new ObjectId(assetId),
      employeeEmail,
      status: 'assigned'
    })

    if (!assigned) {
      return res.status(404).send({ message: 'Assigned asset not found' })
    }

   
    await assignedAssetsCollection.deleteOne({ _id: assigned._id })

   
    await inventoryHistoryCollection.insertOne({
      assetId: assigned.assetId,
      employeeEmail,
      action: 'RETURNED',
      date: new Date()
    })

    // Increment availableQuantity in plantsCollection
    await plantsCollection.updateOne(
      { _id: assigned.assetId },
      { $inc: { availableQuantity: 1 } }
    )

    res.send({ message: 'Asset returned and removed successfully' })
  } catch (err) {
    console.error(err)
    res.status(500).send({ message: 'Failed to return asset', error: err.message })
  }
})

app.get('/team', verifyJWT, verifyEmployee, async (req, res) => {
  try {
    const { employeeEmail, hrEmail, companyName } = req.query

    const filter = {}
    if (hrEmail) filter.hrEmail = hrEmail
    if (companyName) filter.companyName = companyName
    if (employeeEmail) filter.employeeEmail = employeeEmail

    const teamData = await teamcollection.find(filter).toArray()

    if (!teamData.length) {
      return res.status(404).send({ message: 'No team data found' })
    }

    res.send(teamData)
  } catch (err) {
    console.error(err)
    res.status(500).send({ message: 'Failed to fetch team data', error: err.message })
  }
})


app.get('/inventory-history', verifyJWT, verifyEmployee, async (req, res) => {
  try {
    const employeeEmail = req.tokenEmail

    const history = await inventoryHistoryCollection
      .find({ employeeEmail })
      .sort({ date: -1 })
      .toArray()

    res.send(history)
  } catch (err) {
    console.error(err)
    res.status(500).send({ message: 'Failed to fetch inventory history', error: err.message })
  }
})

app.get('/employee/inventory', verifyJWT, verifyEmployee, async (req, res) => {
  const inventory = await myInventoryCollection.findOne({
    employeeEmail: req.tokenEmail,
  })
  res.send(inventory || { items: [] })
})
app.get('/employee/inventory-history', verifyJWT, verifyEmployee, async (req, res) => {
  const history = await inventoryHistoryCollection
    .find({ employeeEmail: req.tokenEmail })
    .sort({ date: -1 })
    .toArray()

  res.send(history)
})

app.get(
  '/assigned-assets',
  verifyJWT,
  async (req, res) => {
    const requesterEmail = req.tokenEmail
    const { employeeEmail } = req.query

    try {
   
      const user = await usersCollection.findOne({ email: requesterEmail })

      if (!user) {
        return res.status(404).send({ message: 'User not found' })
      }

      let query = {}

     
      if (user.role === 'hr') {
        query.hrEmail = user.email

        if (employeeEmail) {
          query.employeeEmail = employeeEmail
        }
      }

    
      else if (user.role === 'employee') {
        query.employeeEmail = user.email
      }

      else {
        return res.status(403).send({ message: 'Access denied' })
      }

     
      const assignedAssets = await assignedAssetsCollection
        .find(query)
        .sort({ assignmentDate: -1 })
        .toArray()

      res.send(assignedAssets)
    } catch (error) {
      console.error(error)
      res.status(500).send({ message: 'Failed to fetch assigned assets' })
    }
  }
)

    // ------------------ PLANS ROUTES ------------------
    app.get('/plans', async (req, res) => {
      try {
        const result = await plansCollection.find().toArray()
        res.send(result)
      } catch (error) {
        res.status(500).send({ message: 'Server Error', error: error.message })
      }
    })

    app.post('/plans', async (req, res) => {
      try {
        const { name, employeeLimit, price, features } = req.body
        if (!name || !employeeLimit || !price || !Array.isArray(features)) {
          return res.status(400).send({ message: "Invalid payload!" })
        }

        const planDoc = { name, employeeLimit, price, features, createdAt: new Date() }
        const result = await plansCollection.insertOne(planDoc)
        res.send(result)
      } catch (error) {
        res.status(500).send({ message: 'Server Error', error: error.message })
      }
    })

    // ------------------ STRIPE CHECKOUT ------------------
    app.post('/create-checkout-session', verifyJWT, async (req, res) => {
      try {
        const { packageName, employeeLimit, price, hrEmail } = req.body
        if (!packageName || !employeeLimit || !price || !hrEmail) {
          return res.status(400).send({ message: 'Missing fields' })
        }

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: { name: packageName },
                unit_amount: price * 100,
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          success_url: `${process.env.CLIENT_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.CLIENT_DOMAIN}/payment-cancelled`,
          metadata: { hrEmail, packageName, employeeLimit },
        })

        await paymentsCollection.insertOne({
          hrEmail,
          packageName,
          employeeLimit,
          amount: price,
          transactionId: session.payment_intent || null,
          paymentDate: new Date(),
          status: 'pending',
        })

        res.send({ url: session.url })
      } catch (err) {
        console.log(err)
        res.status(500).send({ message: 'Stripe Error', error: err.message })
      }
    })

    // ------------------ PAYMENT SUCCESS ------------------
    app.post('/payment-success', verifyJWT, async (req, res) => {
      try {
        const { sessionId } = req.body
        const session = await stripe.checkout.sessions.retrieve(sessionId)

        const hrEmail = session.metadata.hrEmail
        const packageName = session.metadata.packageName
        const employeeLimit = parseInt(session.metadata.employeeLimit)
        const amount = session.amount_total / 100

        // Update payment status
        await paymentsCollection.updateOne(
          { hrEmail, packageName, status: 'pending' },
          {
            $set: {
              status: session.payment_status === 'paid' ? 'completed' : 'failed',
              transactionId: session.payment_intent,
              paymentDate: new Date(),
              employeeLimit,
            },
          }
        )

        // Update HR package info
        await hrCollection.updateOne(
          { email: hrEmail },
          {
            $set: {
              packageLimit: employeeLimit,
              subscription: packageName.toLowerCase(),
            },
          }
        )

await usersCollection.updateMany(
  { email: hrEmail }, // filter by user email
  { $set: { packageLimit: employeeLimit } }
)

     res.send({
      message: 'Payment Recorded, HR & Users Updated',
      employeeLimit,
      subscription: packageName,
    })
  } catch (err) {
    console.log(err)
    res.status(500).send({ message: 'Payment Success Error', error: err.message })
  }
})
    // ------------------ MY ORDERS (CHANGED: Employee only) ------------------
    app.get('/my-orders', verifyJWT, verifyEmployee, async (req, res) => {
      const result = await ordersCollection
        .find({ customer: req.tokenEmail })
        .toArray()
      res.send(result)
    })

    // ------------------ MY INVENTORY (CHANGED: HR or Employee) ------------------
    app.get('/my-inventory', verifyJWT, verifyHRorEmployee, async (req, res) => {
      const result = await plantsCollection
        .find({ 'seller.email': req.tokenEmail })
        .toArray()
      res.send(result)
    })

    // ------------------ SAVE USER ------------------
       app.post('/user', async (req, res) => {
         const user = req.body
         const exists = await usersCollection.findOne({ email: user.email })
   
         if (exists) {
           await usersCollection.updateOne(
             { email: user.email },
             { $set: { last_loggedIn: new Date().toISOString() } }
           )
           return res.send({ message: 'User Updated' })
         }
   
         user.role = 'customer'
         user.created_at = new Date().toISOString()
         user.last_loggedIn = new Date().toISOString()
   
         const result = await usersCollection.insertOne(user)
         res.send(result)
       })
   
       // ------------------ USER ROLE ------------------
       app.get('/user/role', verifyJWT, async (req, res) => {
         const user = await usersCollection.findOne({ email: req.tokenEmail })
         res.send({ role: user?.role })
       })
   // ------------------ USER PackageLimit ------------------
       app.get('/user/packageLimit', verifyJWT, async (req, res) => {
         const user = await usersCollection.findOne({ email: req.tokenEmail })
         res.send({ PackageLimit: user?.packageLimit })
       })
   // ------------------ USER PackageLimit ------------------
       app.get('/plans/employeeLimit', verifyJWT, async (req, res) => {
         const plans = await usersCollection.findOne({ email: req.tokenEmail })
         res.send({ employeeLimit: plans?.packageLimit })
       })
       // ------------------ BECOME SELLER ------------------
       app.post('/become-seller', verifyJWT, async (req, res) => {
         const email = req.tokenEmail
         const exists = await sellerRequestsCollection.findOne({ email })
   
         if (exists) {
           return res.status(409).send({ message: 'Already Requested' })
         }
   
         const result = await sellerRequestsCollection.insertOne({ email })
         res.send(result)
       })
   
       // ------------------ SELLER REQUESTS (ADMIN) ------------------
       app.get('/seller-requests', verifyJWT, verifyADMIN, async (req, res) => {
         const result = await sellerRequestsCollection.find().toArray()
         res.send(result)
       })
   
       // ------------------ ALL USERS (CHANGED: HR only) ------------------
       // User asked: manage-users should be HR-only -> updated
       app.get('/users', verifyJWT, verifyHR, async (req, res) => {
         const result = await usersCollection.find().toArray()
         res.send(result)
       })
   
       // ------------------ ASSET PERMISSION ------------------
       app.post('/asset-permission', verifyJWT, async (req, res) => {
         const body = req.body
         const email = req.tokenEmail
   
         const exists = await permissionRequestsCollection.findOne({
           'seller.email': email,
           'product.id': body.product.id
         })
   
         if (exists) {
           return res.status(409).send({ message: 'Already requested for this asset' })
         }
   
         const requestDoc = {
           seller: body.seller,
           product: body.product,
           status: 'pending',
           requestDate: new Date()
         }
   
         const result = await permissionRequestsCollection.insertOne(requestDoc)
         res.send({ message: 'Permission request submitted', result })
       })
   
     
       app.get('/asset-permission', verifyJWT, verifyHR, async (req, res) => {
         const requests = await permissionRequestsCollection.find().toArray()
         res.send(requests)
       })
   
      app.patch('/asset-permission/:id', verifyJWT, verifyHR, async (req, res) => {
  const { status } = req.body
  const { id } = req.params

  try {
  
    const result = await permissionRequestsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    )

   
    if (status === 'approved') {
      const request = await permissionRequestsCollection.findOne({ _id: new ObjectId(id) })
      if (!request) return res.status(404).send({ message: 'Request not found' })

      const { seller } = request

     
      const existingAffiliation = await employeeAffiliationsCollection.findOne({
        employeeEmail: seller.email,
        hrEmail: req.tokenEmail,
        status: 'active',
      })

      if (!existingAffiliation) {
        await employeeAffiliationsCollection.insertOne({
          employeeName: seller.name,
          employeeEmail: seller.email,
          hrEmail: req.tokenEmail,
          status: 'active',
          companyName: seller.companyName || 'N/A',
          startDate: new Date(),
        })
      }
    }

    res.send({ message: 'Permission status updated', result })
  } catch (err) {
    console.error(err)
    res.status(500).send({ message: 'Update failed' })
  }
})

       // ------------------ EMPLOYEE JOIN (WITH USER UPDATE) ------------------
       app.post('/join-employee', verifyJWT, async (req, res) => {
         try {
           const { name, email, password, dateOfBirth } = req.body
   
           if (!name || !email || !password || !dateOfBirth) {
             return res.status(400).send({ message: 'All fields required' })
           }
   
           const exists = await employeesCollection.findOne({ email })
           if (exists) return res.status(409).send({ message: 'Employee exists' })
   
           const employeeDoc = {
             name,
             email,
             password,
             dateOfBirth,
             role: "employee",
             createdAt: new Date()
           }
   
           const result = await employeesCollection.insertOne(employeeDoc)
   
           await usersCollection.updateOne(
             { email },
             {
               $set: {
                 role: "employee",
                 dateOfBirth,
                 createdAt: new Date()
               }
             }
           )
   
           res.send({ message: "Employee registered & user updated", result })
         } catch (err) {
           res.status(500).send({ message: "Server Error", error: err.message })
         }
       })
   
       // ------------------ HR JOIN (WITH USER UPDATE) ------------------
       app.post('/join-hr', verifyJWT, async (req, res) => {
         try {
           const { name, companyName, companyLogo, email, password, dateOfBirth } = req.body
   
           if (!name || !companyName || !companyLogo || !email || !password || !dateOfBirth) {
             return res.status(400).send({ message: 'All fields required' })
           }
   
           const exists = await hrCollection.findOne({ email })
           if (exists) return res.status(409).send({ message: 'HR exists' })
   
           const hrDoc = {
             name,
             companyName,
             companyLogo,
             email,
             password,
             dateOfBirth,
             role: "hr",
             packageLimit: 5,
             currentEmployees: 0,
             subscription: "basic",
             createdAt: new Date()
           }
   
           const result = await hrCollection.insertOne(hrDoc)
   
           await usersCollection.updateOne(
             { email },
             {
               $set: {
                 role: "hr",
                 companyName,
                 packageLimit: 5
               }
             }
           )
   
           res.send({ message: "HR registered & user updated", result })
         } catch (err) {
           res.status(500).send({ message: "Server Error", error: err.message })
         }
       })
   
       // ------------------ ADMIN LIST ROUTES ------------------
       app.get('/employees', verifyJWT, verifyADMIN, async (req, res) => {
         const result = await employeesCollection.find().toArray()
         res.send(result)
       })
   
       app.get('/hr', verifyJWT, verifyADMIN, async (req, res) => {
         const result = await hrCollection.find().toArray()
         res.send(result)
       })
   
       // ------------------ UPDATE ROLE ------------------
       app.patch('/update-role', verifyJWT, verifyADMIN, async (req, res) => {
         const { email, role } = req.body
   
         const result = await usersCollection.updateOne(
           { email },
           { $set: { role } }
         )
   
         await sellerRequestsCollection.deleteOne({ email })
   
         res.send(result)
       })
    
  // ------------------ UPDATE PROFILE ------------------
app.post('/user/update-profile', verifyJWT, async (req, res) => {
  const { photoURL, coverImage } = req.body
  const email = req.tokenEmail // from JWT

  try {
    const result = await usersCollection.updateOne(
      { email },
      { $set: { photoURL, coverImage } }
    )

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: 'User not found' })
    }

    res.send({ message: 'Profile updated successfully', result })
  } catch (err) {
    console.error(err)
    res.status(500).send({ message: 'Failed to update profile', error: err.message })
  }
})
// GET user profile
app.get('/user/profile', verifyJWT, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ email: req.tokenEmail })
    if (!user) return res.status(404).send({ message: 'User not found' })
    res.send({
      photoURL: user.photoURL || '',
      coverImage: user.coverImage || '',
      displayName: user.displayName
    })
  } catch (err) {
    console.error(err)
    res.status(500).send({ message: 'Failed to fetch profile', error: err.message })
  }
})

    console.log('✅ MongoDB Connected Successfully!')
  } catch (err) {
    console.log(err)
  }
}
run()

app.get('/', (req, res) => res.send('Server Running Successfully'))
app.listen(port, () => console.log(`Server running on port ${port}`))

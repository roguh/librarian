const express = require('express')
const NATS = require('nats')
const passport = require('passport')
const Strategy = require('passport-local').Strategy
const bcrypt = require('bcryptjs')
const bodyParser = require('body-parser')
const Prometheus = require('prom-client')
const prometheusMetrics = require("express-prom-bundle");
const ensureLogin = require('connect-ensure-login')
const errorhandler = require('errorhandler')
const expressSession = require('express-session')
const expressNunjucks = require('express-nunjucks')
const favicon = require('serve-favicon')
const helmet = require('helmet')
const morgan = require('morgan')
const path = require('path')
const { Sequelize, Model, DataTypes } = require('sequelize')
const Joi = require('@hapi/joi')
const validator = require('express-joi-validation').createValidator({})
const running_in_docker = require('./running_in_docker')
require('dotenv').config({ path: '../postgres_dev.env' })

const PORT = process.env.PORT || 8888

const DEFAULT_LIMIT = 1000

// Initialize bcrypt
const saltRounds = 10
const salt = bcrypt.genSaltSync(saltRounds)

// const sequelize = new Sequelize('sqlite::memory:')

// Connect to database
const sequelize = new Sequelize(
  process.env.POSTGRES_DB,
  process.env.POSTGRES_USER,
  process.env.POSTGRES_PASSWORD, {
    host: running_in_docker() ? 'postgres' : 'localhost',
    dialect: 'postgres'
})

// Create database structures
// Users, Content, users <-> content, authors <-> Content, keywords <-> Content
const User = sequelize.define('User', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    username: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false },
    verified: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
    pwhash: { type: DataTypes.STRING, allowNull: false },
  }, {})

const Content = sequelize.define('Content', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    url: { type: DataTypes.STRING, allowNull: false },
    html: { type: DataTypes.TEXT },
    title: { type: DataTypes.STRING },
    meta_lang: { type: DataTypes.STRING },
    meta_description: { type: DataTypes.TEXT },
    top_image: { type: DataTypes.STRING },
    images: { type: DataTypes.STRING },
    authors: { type: DataTypes.TEXT },
    text: { type: DataTypes.TEXT },
    keywords: { type: DataTypes.TEXT },
    summary: { type: DataTypes.TEXT },
    jsonb: { type: DataTypes.JSONB },
  }, {})

sequelize.authenticate()
  .then(console.log('Connection has been established successfully.'))
  .catch(err => console.error(`Unable to connect to db. ${err}`))

sequelize.sync()
  .then(() =>
    User.create({
      username: 'hugo',
      email: 'hugo@roguh.com',
      verified: true,
      pwhash: bcrypt.hashSync('p4ssword', salt)
    }).then((u) => console.log(u.toJSON()))
  )
  .catch(err => console.error(`Unable to create db structures. ${err}`))

// Use local user authentication
passport.use(new Strategy(
  async (username, password, cb) => {
    const user = await User.findOne({ where: ({ username }) })
    console.log(user)
    if (!user)
      return cb(null, false)
    const matches = bcrypt.compareSync(password, user.pwhash)
    if (matches)
      return cb(null, user)
    else
      return cb(null, false)
}))

passport.serializeUser((user, cb) => cb(null, user.id))

passport.deserializeUser(async (id, cb) => {
  const user = await User.findOne({ where: ({ id }) })
  if (user)
    cb(null, user)
  else
    cb(`user id=${id} not found`)
})

// Prometheus metrics
const collectDefaultMetrics = Prometheus.collectDefaultMetrics
collectDefaultMetrics({ timeout: 5000 })

const prometheusMetricsMiddleware = prometheusMetrics({
  includeMethod: true,
  includePath: true
})

// Create and configure Express server
const app = express()
// TODO setup csurf CSRF tokens

app.use(morgan('combined'))
app.use(expressSession({ secret: '1530981421', resave: false, saveUninitialized: false }))
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')))
app.use(helmet())
app.use(prometheusMetricsMiddleware)
app.use(passport.initialize())
app.use(passport.session())

const isDev = process.env.NODE_ENV !== 'production'

const njk = expressNunjucks(app, {
    watch: isDev,
    noCache: isDev,
    trimBlocks: true,
    lstripBlocks: true
})

if (isDev) {
  app.use(errorhandler())
}

// Connect to NATS
NATS_ADDR = running_in_docker() ? 'nats' : 'localhost'
NATS_PORT = 4333
let nc = NATS.connect({url: `nats://${NATS_ADDR}:${NATS_PORT}`})

nc.on('error', (err) => {
  console.error(err)
  if (err.code === 'CONN_ERR')
    nc = null
})

nc.on('connect', () => {
  nc.subscribe('content-updates', (msg) => {
    console.log(msg)
  })
  nc.subscribe('content-failures', (msg) => {
    console.log(msg)
  })
})

// Express
app.get('/', (req, res) =>
  res.render('base', {
    title: 'Meet Librarian',
    description: 'Magic.',
    url: '/',
    content: `Welcome. Meet your personal Librarian: an AI-driven "pocket clone."
    ${(req.user
      ? '<a href="/list">See list</a>'
      : '<a href="/signup">Create an account</a> or <a href="/login">Login</a>')}
  `}))

app.get('/healthcheck', (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.send(JSON.stringify({ 'status': 'OK' }))
})

app.get('/metrics', (req, res) => {
  res.set('Content-Type', Prometheus.register.contentType)
  res.end(Prometheus.register.metrics())
})

// Login and logout routes
app.route('/login')
  .get((req, res) => res.render('base', {
    title: 'Login',
    description: '',
    url: '/login',
    content: `
      <form action="/login" method="post">
      	<div><label>Username:</label><input type="text" name="username"/><br/></div>
      	<div><label>Password:</label><input type="password" name="password"/></div>
      	<div><input type="submit" value="Submit"/></div>
      </form>
    `}))
  .post(
    bodyParser.urlencoded({ extended: true }),
    passport.authenticate('local',
      { successReturnToOrRedirect: '/list', failureRedirect: '/login' }),
    (req, res) => res.redirect('/list')
  )

app.get('/logout', (req, res) => {
  req.logout()
  res.redirect('/')
})

// Signup
app.route('/signup')
  .get((req, res) => res.render('base', {
    title: 'Sign up',
    description: '',
    url: '/signup',
    content: `
      <form action="/signup" method="post">
      	<div><label>Username:</label><input type="text" name="username"/><br/></div>
      	<div><label>Email:</label><input type="email" name="email"/><br/></div>
      	<div><label>Password:</label><input type="password" name="password"/></div>
      	<div><input type="submit" value="Sign up"/></div>
      </form>
    `}))
  .post(
    bodyParser.urlencoded({ extended: true }),
    (req, res) => {
      const { username, email, password } = req.body
      User.create({
        username, email, pwhash: bcrypt.hashSync(password, salt)
      }).then(() => res.redirect('/login'))
    })


// Routes for logged-in users only
const api = express.Router()

// Make sure users are logged in.
api.use(ensureLogin.ensureLoggedIn('/login'))

const addSchema = Joi.object({
  url: Joi.string().required(),
})

const listSchema = Joi.object({
  limit: Joi.number(),
  offset: Joi.number(),
})

api.post('/add',
  bodyParser.urlencoded({ extended: true }),
  validator.body(addSchema),
  (req, res) => {
    const { url } = req.body
    if (nc) {
      const msg = { url, userid: req.user.id, username: req.user.username }
      nc.publish('urls', JSON.stringify(msg), () =>
        console.log('sent to NATS subject="urls"')
      )
    } else {
      console.error('no NATS connection')
    }
    res.redirect('/list')
})

api.get('/list', validator.query(listSchema), async (req, res) => {
  const limit = req.query.limit || DEFAULT_LIMIT
  const offset = req.query.offset || 0
  const cs = await Content.findAll({ limit, offset })

  res.render('base', {
    title: 'Your list',
    description: 'Magic.',
    url: '/',
    content: `Welcome, ${req.user.username}.
      <form action="/add" method="post">
      	<div><label>Add URL</label><input type="text" name="url"/><br/></div>
      </form>
      <ul>
        ${cs.map(c => `<li>
            <p>
            <a href='${c["url"]}'>${c["title"]} by ${c["authors"]}</a>:
            <span>${c["summary"] ? c["summary"].slice(0, 300) + '...' : ''}</span>
            </p>
            <p>${c["text"] ? c["text"].slice(0, 128) + '...' : ''}</p>
            <p>${c["keywords"]}</p>
          </li>`).join('\n')}
      </ul>
    `})
})

api.get('/count', validator.body(listSchema), async (req, res) => {
  const limit = req.query.limit || DEFAULT_LIMIT
  const offset = req.query.offset || 0
  const cs = await Content.findAll({ limit, offset })
  res.setHeader('Content-Type', 'application/json')
  res.send(JSON.stringify({ 'count': cs.length }))
})

app.use('/', api)

// Start server
app.listen(PORT, () => console.log(`Listening on port ${PORT}! NODE_ENV=${process.env.NODE_ENV}`))

const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')

let db = null

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running')
    })
  } catch (error) {
    console.log(`DB Error : ${error.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

const convertStateDbObjectToResponseObject = dbObject => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  }
}

const convertDistrictDbObjectToResponseObject = dbObject => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  }
}

// Login API

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `
    SELECT * 
    FROM user
    WHERE username = "${username}";`

  const selectedUser = await db.get(selectUserQuery)

  if (selectedUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordCorrect = await bcrypt.compare(
      password,
      selectedUser.password,
    )

    if (isPasswordCorrect === true) {
      const payload = {
        username: username,
      }

      const jwtToken = jwt.sign(payload, 'SECRETKEY')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHead = request.headers['authorization']
  if (authHead !== undefined) {
    jwtToken = authHead.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'SECRETKEY', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

// Get all states API
app.get('/states/', authenticateToken, async (request, response) => {
  const getAllStatesQuery = `
        SELECT *
        FROM state;`

  const statesList = await db.all(getAllStatesQuery)
  response.send(
    statesList.map(eachState =>
      convertStateDbObjectToResponseObject(eachState),
    ),
  )
})

// Get state API

app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params

  const getStateQuery = `
    SELECT * FROM state
    WHERE state_id = ${stateId};`

  const selectedState = await db.get(getStateQuery)
  response.send(convertStateDbObjectToResponseObject(selectedState))
})

// Post district API

app.post('/districts/', authenticateToken, async (request, response) => {
  const {districtName, stateId, cases, cured, active, deaths} = request.body

  const insertDistrictQuery = `
    INSERT INTO district (district_name, state_id, cases, cured, active, deaths)
    VALUES ("${districtName}", ${stateId}, ${cases}, ${cured}, ${active}, ${deaths});`

  await db.run(insertDistrictQuery)
  response.send('District Successfully Added')
})

// Get district API

app.get(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params

    const getDistrictQuery = `
  SELECT * FROM district
  WHERE district_id = ${districtId};`

    const selectedDistrict = await db.get(getDistrictQuery)
    response.send(convertDistrictDbObjectToResponseObject(selectedDistrict))
  },
)

// Delete District API

app.delete(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params

    const deleteDistrictQuery = `
  DELETE FROM district
  WHERE district_id = ${districtId};`

    await db.run(deleteDistrictQuery)
    response.send('District Removed')
  },
)

// Put District API

app.put(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const {districtName, stateId, cases, cured, active, deaths} = request.body

    const updateDistrictQuery = `
  UPDATE district
  SET district_name = "${districtName}",
  state_id = ${stateId},
  cases = ${cases},
  cured = ${cured},
  active = ${active},
  deaths = ${deaths}
  WHERE district_id = ${districtId};`

    await db.run(updateDistrictQuery)
    response.send('District Details Updated')
  },
)

// GET stats API

app.get(
  '/states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params

    const getStatsQuery = `
  SELECT SUM(cases) as totalCases,
  SUM(cured) as totalCured,
  SUM(active) as totalActive,
  SUM(deaths) as totalDeaths
  FROM district
  WHERE state_id = ${stateId};`

    const statsObj = await db.get(getStatsQuery)
    response.send(statsObj)
  },
)

module.exports = app

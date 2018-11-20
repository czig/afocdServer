// =======================
// get the packages we need ============
// =======================
var express     = require('express')
var http        = require('http')
var https       = require('https')
var fs          = require('fs')
var path        = require('path')
var app         = express()
var bodyParser  = require('body-parser')
var morgan      = require('morgan')
const sqlite3   = require('sqlite3').verbose()
var config      = require('./config') // get our config file
var cors        = require('cors')
var moment      = require('moment')


// =======================
// configuration =========
// =======================
var port = process.env.PORT || 5005 // used to create, sign, and verify tokens
let db = new sqlite3.Database(config.database)

//CORS
//Requests are only allowed from whitelisted url
// var whitelist = ['http://localhost:8080','https://localhost:8080']
var corsOptions = {
    origin: function (origin, callback){
        // whitelist-test pass
        if (true){//(whitelist.indexOf(origin) !== -1){
            callback(null, true)
        }
        // whitelist-test fail
        else{
            callback(new Error('Not on whitelist'))    
        }
    }
}
app.use(cors(corsOptions))

// use body parser so we can get info from POST and/or URL parameters
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

// use morgan to log requests to the console
app.use(morgan('dev'))

// =======================
// routes ================
// =======================
// basic route

app.get('/', (req, res)=> {
    res.send('Hello! The API is at http://localhost:' + port + '/api')
})

// API ROUTES -------------------
var apiRoutes = express.Router()

apiRoutes.get('/', (req, res)=>{
    res.json({message: 'Welcome to the API ROOT'})
})

apiRoutes.get('/getCips', (req, res)=>{
    let sql1 = 'SELECT * from cip order by CIP_code' 
    db.all(sql1, (err, rows) =>{
        if(err){
            throw err
        }
        else if (!rows){
            res.json({
                success: false,
                message: 'No Data'
            })
        }
        else{
            res.json({
                success: true,
                data: rows 
            })
        }
    })
})

apiRoutes.get('/getLastUpdateDate',(req,res) => {
    var afsc = req.query.afsc
    let sql1 = `select max(submitDate) as lastUpdate from degreeRows where afsc=(?)` 
    db.get(sql1, afsc, (err,row) => {
        if (err) {
            throw err
        } else if (!row) {
            res.json({
                success: false,
                message: 'No previous update.'
            })
        } else {
            res.json({
                success: true,
                data: row
            })
        }
    })
})

apiRoutes.get('/getDegreeQuals',(req,res) => {
    var afsc = req.query.afsc
    let sql1 = `select qual.afsc, 
                        qual.tier, 
                        qual.cip_code, 
                        cip.cip_t as degreeName, 
                        qual.tierOrder 
                from degreeRows as qual
                left join cip as cip
                    on qual.cip_code = cip.cip_code
                where afsc=(?) 
                    and qual.submitDate = (select max(submitDate) from degreeRows
                                            where afsc=(?))
                order by qual.cip_code`
    db.all(sql1, [afsc,afsc], (err, rows) => {
        if (err) {
            throw err
        } else if (!rows) {
            res.json({
                success: false,
                message: 'No Data'
            })
        } else {
            res.json({
                success: true,
                data: rows 
            })
        }
    })
})

apiRoutes.get('/getTargetRates',(req,res) => {
    var afsc = req.query.afsc
    let sql1 = `select tier, 
                        trim(criteria) as criteria,
                        percent
                from targetRates 
                where afsc=(?) 
                    and submitDate = (select max(submitDate) from targetRates 
                                            where afsc=(?))
                `
    db.all(sql1, [afsc,afsc], (err, rows) => {
        if (err) {
            throw err
        } else if (!rows) {
            res.json({
                success: false,
                message: 'No Data'
            })
        } else {
            res.json({
                success: true,
                data: rows 
            })
        }
    })
})

apiRoutes.get('/getCipTypes',(req,res) => {
    let sql1 = `select substr(cip.cip_code,1,2)||".XXXX" as degreeType,
                        count(*) as total
                from cip as cip
                group by degreeType
                order by degreeType`
    db.all(sql1, [], (err, rows) => {
        if (err) {
            throw err
        } else if (!rows) {
            res.json({
                success: false,
                message: 'No Data'
            })
        } else {
            res.json({
                success: true,
                data: rows 
            })
        }
    })
})

apiRoutes.get('/getAfscs',(req,res) => {
    let sql1 = 'select distinct afsc from degreeRows'
    db.all(sql1, (err, rows) => {
        if (err) {
            throw err
        } else if (!rows) {
            res.json({
                success: false,
                message: 'No Data'
            })
        } else {
            res.json({
                success: true,
                data: rows 
            })
        }
    })
})

apiRoutes.get('/getDegreeSummary',(req,res) => {
    var afsc = req.query.cip
    let sql1 = `select cip, avgNumPerYear, avgPercentile 
                from degreeSummary where cip=(?)`
    db.all(sql1, afsc, (err, rows) => {
        if (err) {
            throw err
        } else if (!rows) {
            res.json({
                success: false,
                message: 'No Data'
            })
        } else {
            res.json({
                success: true,
                data: rows 
            })
        }
    })
})

apiRoutes.get('/spoofGet',(req,res) => {
    let sql1 = `
                    select current_timestamp as date;
                `
    var data = []
    db.serialize(function() {
        db.all(sql1, [], (err, rows) => {
            console.log(rows[0])
            data.push(rows[0])
        })
        db.all(sql1, [], (err, rows) => {
            console.log(rows[0])
            data.push(rows[0])
            console.log(data)
            res.json({
                success: true,
                data: data 
            })
        })
    })
})

apiRoutes.post('/spoofPost',(req,res) => {
    console.log(req)
    if (req) {
        res.status(200).send({
            success: true,
            message: 'Received'
        })
    }
})

apiRoutes.post('/submitDegreeQuals',(req,res) => {
    console.log(req)
    //pull values from request
    var afsc = req.body.afsc
    var degrees = req.body.degrees
    var person = req.body.person
    //set up sql insert
    let sqlPost = `INSERT INTO degreeRows 
                    (afsc,tier,CIP_Code,submitDate,submittedBy,tierOrder)
                    values `
    //make string for each insert
    let queryValues = "((?), (?), (?), CURRENT_TIMESTAMP, (?), (?))"
    var data = []
    var rowValues = []
    //make one dimensional array for query and data elements
    for (let i = 0; i < degrees.length; i++) {
        var j = Math.trunc(i / 100);
        if (i % 100 === 0) {
            rowValues[j] = []
            data[j] = []
        }
        rowValues[j].push(queryValues)
        data[j].push(afsc)
        data[j].push(degrees[i].tier)
        data[j].push(degrees[i].CIP_Code)
        data[j].push(person)
        data[j].push(degrees[i].tierOrder)
    }
    //make large insert string
    var sqlPosts = []
    rowValues.forEach((d,i) => {
        sqlPosts[i] = sqlPost + d.join(", "); 
    })
    var result = []
    //perform inserts in serial (only applies to methods in 'db' class)
    db.serialize(function() {
        var promises = []
        //begin transaction to keep current_timestamp same for all inserts
        db.run('begin transaction');
        data.forEach((d,i) => {
            //wrap database call in promise so we can determine success once
            //all calls have completed
            promises.push(new Promise((res,rej) => {
                db.run(sqlPosts[i], d, function(err) {
                    if (err) {
                        throw err
                        //resolve promise with value false
                        res(false)
                    } else {
                        //resolve promise with value true
                        res(true)
                    }
                })
            })
            )
        })
        //run commit to finish transaction
        db.run('commit');
        //once all promises have been resolved, determine success
        Promise.all(promises).then((payload) => {
            if (payload.every(d => d)) {
                res.status(200).send({
                    success: true,
                    message: 'Data successfully submitted!'
                })
            } else {
                res.status(400).send({
                    success: fase,
                    message: 'Error attempting to submit data.'
                })
            }
        })
    })
})

apiRoutes.post('/submitTargetRates',(req,res) => {
    console.log(req)
    //pull values from request
    var afsc = req.body.afsc
    var targetRates = req.body.targetRates
    var person = req.body.person
    //set up sql insert
    let sqlPost = `INSERT INTO targetRates 
                    (afsc,tier,criteria,percent,submitDate,submittedBy)
                    values `
    //make string for each insert
    let queryValues = "((?), (?), (?), (?), CURRENT_TIMESTAMP, (?))"
    var data = []
    var rowValues = []
    //make one dimensional array for query and data elements
    for (let i = 0; i < targetRates.length; i++) {
        rowValues.push(queryValues)
        data.push(afsc)
        data.push(targetRates[i].tier)
        data.push(targetRates[i].criteria)
        data.push(targetRates[i].percent)
        data.push(person)
    }
    //make large insert string
    sqlPost += rowValues.join(", ");

    db.run(sqlPost, data, function(err) {
        if (err) {
            throw err
        } else {
            res.status(200).send({
                success: true,
                message: 'Data successfully submitted!'
            })
        }
    })
})


app.use('/api', apiRoutes)

// =======================
// start the server ======
// =======================


app.listen(port)
// const options = {
//   key: fs.readFileSync('../tm/localhost.key'),
//   cert: fs.readFileSync('../tm/localhost.crt'),
//   passphrase: '1234'
// };

// https.createServer(options, app).listen(port);
// console.log('Server up at https://localhost:' + port)

console.log('Server up at http://localhost:' + port)

function dtSAStoJS(dtSAS,dtType='DATE'){
  // accepts SAS unformatted DATE or DATETIME
  // dtType should be used to determine the above
  // -315619200000 is equivalent to +new Date(1960,0,1)
  // 86400000 is equivalent to 24h * 60m * 60s * 1000ms
  if(dtType==='DATE'){
    return new Date(-315619200000 + dtSAS * 86400000);
  } else if (dtType==='DATETIME'){
    return new Date(-315619200000 + dtSAS * 1000);
  } else {
    console.log('Unknown dtType value - ' + dtType);
    return null;
  }
};


function formatSASDate(sasdate) {
    if (sasdate){
        var date = new Date(-315619200000 + sasdate * 86400000)

        var year = date.getFullYear();

        var month = (1 + date.getMonth()).toString();
        month = month.length > 1 ? month : '0' + month;

        var day = date.getDate().toString();
        day = day.length > 1 ? day : '0' + day;

        return year + '/' + month + '/' + day;
    }
    else {
        return ""
    }
}

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
                order by qual.cip_code`
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

apiRoutes.get('/getAllTypes',(req,res) => {
    var afsc = req.query.afsc
    let sql1 = `select qual.degreeType||".XXXX" as degreeType,
                        qual.numChosen,
                        cip.total
                from (
                        select substr(cip_code,1,2) as degreeType,
                                count(*) as numChosen
                        from degreeRows
                        where afsc=(?)
                        group by degreeType
                        order by degreeType
                     ) as qual 
                left join (
                            select substr(cip_code,1,2) as degreeType,
                                    count(*) as total
                            from cip
                            group by degreeType
                            order by degreeType
                          ) as cip
                    on qual.degreeType = cip.degreeType
                group by qual.degreeType
                order by qual.degreeType`
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



//API endpoint for officer post requests (submitting ranked billets)
apiRoutes.post('/officers', (req, res)=>{
    var officerId = req.decoded.id
    var comment = req.body.comment
    var departureDate = req.body.desiredDepartureDate
    var desiredRNLTD = req.body.desiredRNLTD
    var interests = JSON.stringify(req.body.interests)
    var qualifications = JSON.stringify(req.body.qualifications)
    console.log(req.body)
    var sqlPost = `UPDATE officers set comment = (?), 
                                   departureDate = (?), 
                                   desiredRNLTD = (?), 
                                   interests = (?), 
                                   qualifications = (?) 
                                       where rowid = (?)`
    db.run(sqlPost, [comment, departureDate, desiredRNLTD, interests, qualifications, officerId], function(err){
        //If error
        if (err){
            throw err
        }
        //If success 
        else {
            //changes property used for confirming update or delete statements
            console.log("Rows changed: " + this.changes)
            res.status(200).send({
                success: true,
                message: 'Successfully submitted.'
            })
        }
    })
})

//API endpoint for officers getting ranked billets
apiRoutes.get('/billets_fave', (req,res)=>{
    var officerId = req.decoded.id
    console.log(req.decoded)
    var sqlGet = 'Select rankBillets from officers where rowid = (?)'
    db.get(sqlGet, [officerId], (err,row)=>{
        if (err){
            throw err
        }
        else {
            console.log(row)
            res.json({
                success: true,
                data: row
            })
        }
    })
    
})

//API endpoint for officers submitting ranked billets
apiRoutes.post('/billets_fave', (req, res)=>{
    var officerId = req.decoded.id
    var rankedBillets = req.body.rankedBillets
    var sqlPost = 'UPDATE officers set rankBillets = (?) where rowid = (?)' 
    db.run(sqlPost, [rankedBillets, officerId], (err)=>{
        //If error
        if (err){
            throw err
        }
        //If success 
        else {
            //changes property used for confirming update or delete statements
            console.log("Rows changed: " + this.changes)
            res.status(200).send({
                success: true,
                message: 'Successfully submitted.'
            })
        }
    })
})


//API endpoint for my billets page
apiRoutes.get('/billets/:billetId', (req, res)=>{
    res.json({
        success: true,
        billetId: req.params.billetId
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

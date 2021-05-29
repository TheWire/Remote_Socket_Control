const express = require('express');
const session = require('express-session');
const passport = require('passport');
const localStategy = require('passport-local').Strategy;
const { spawn } = require('child_process');
const bcrypt = require('bcrypt');
const favicon = require('serve-favicon');
const path = require('path');
const { ppid } = require('process');
const SALT_ROUNDS = 12;
const { DataFile, SessionFile, UserFile, SocketFile } = require("./lib/datafile");
const { RSCResponse, RSCError } = require("./lib/rsc_error");

const STATIC_PATH =  "../static";
const TRANS_PATH = "../XY_433/";


function sendCommand(pin, code, bits=24, repeat=5) {
    return new Promise((resolve, reject) => {
        const trans = exec(`python3 ${path.join(TRANS_PATH, 'trans-xy.py')} ${pin} ${code} -b ${bits} -r ${repeat}`);
        trans.on('close', code => {
            if(code === 0) {
                resolve();
            } else {
                reject(new RSCError("error in transmit", RSCError.rscErr.SOCKET_ERROR));
            }
        });
    });
}

function checkSocket(socket_id, socket_name) {
    const _socket_id = socket_id;
    const _socket_id_name = socketFile.getSocketByName(socket_name);
    _socket_id = _socket_id || _socket_id_name;
    if(!_socket_id) {
        const err = new RSCError("socket not provided", RSCError.rscErr.INVALID_REQUEST);
        err.addField("socket_id", RSCError.rscFieldErr.NOT_PROVIDED);
        err.addField("socket_name", RSCError.rscFieldErr.NOT_FOUND);
        throw err;
    }
    return _socket_id;
}

const app = express();

const userFile = new UserData();
if(!userFile.loadData()) {
    console.log("no user file found create new admin?");
}

const socketFile = new SockeData();
const gpioFile = new DataFile(path.join(DATA_PATH, 'gpio.json'));
const gpio = gpioFile.getData();

//middlewares
app.use(express.static(STATIC_PATH));
app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(favicon(path.join(STATIC_PATH, '/icon/favicon.ico')));
app.use(session({
    secret: "qdkjrenvr",
    resave: false,
    saveUninitialized: false,
    store: new SessionFile()
}));

passport.use(new localStategy(
    (username, password, done) => {
        const user = userFile.getUserByName(username);
        if(user) {
            if(user.checkPassword(user, password)) {
                done(null, user);
            };
            done(null, false, {message: "password incorrect`"});
        }
        done(null, false, {message: "user not found"});
    }
));

passport.serializeUser((user, done) => {
    return done(null, user.user_id);
});

passport.deserializeUser((id, done) => {
    const user = userFile.getUserById(id);
    if(user) {
        done(null, user);
    }
    done(null, false, {message: "user not found"});
});

app.use(passport.initialize());
app.use(passport.session());



const server = app.listen(PORT, () => {
    console.log('Remote Socket App started on port:', server.address().port);

});

function checkPermission(req, res, next, permission) {
    
}

app.get('/remote-sockets', (req, res) => {
    if(!req.user) return next(new RSCError("permission denied", 
                        RSCError.rscError.PERMISSION_DENIED));
    const sockets = socketFile.getData().sockets;
    res.json(sockets);
});

app.post('/remote-sockets', (req, res, next) => {
    if(!req.user) return next(new RSCError("permission denied", 
                        RSCError.rscError.PERMISSION_DENIED));
    const socket = {
        socket_name: rq.body.socket_name,
        description: req.body.description,
        location: req.body.location,
        on_code: req.boyd.on_code,
        off_code: req.body.off_code,
        bits: req.body.bits,
        repeat: req.body.repeat,
    }
    try {
        socketFile.addSocket(socket);
    } catch (e) {
        if(typeof e === RSCError) {
            return next(e);
        }
    }
    res.json(new RSCResponse([]).okResponse());
});

app.delete('/remote-sockets', (req, res, next) => {
    if(!req.user) return next(new RSCError("permission denied", 
                        RSCError.rscError.PERMISSION_DENIED));
    try {
        const ret = checkSocket(req.socket_id, req.socket_name);
        socketFile.deleteSocket(ret);
    } catch(e) {
        return next(e);
    }
    res.json(new RSCResponse([{socket_id: ret}]).okResponse());
});

app.post('/command', (req, res, next) => {
    if(!req.user) return next(new RSCError("permission denied", 
                        RSCError.rscError.PERMISSION_DENIED));
    let socket_id;
    try {
        socket_id = checkSocket(req.socket_id, req.socket_name);
    } catch(e) {
        return next(e);
    }

    const on;
    if(req.on_off === "on") {
        on = true;
    } else if(req.on_off === "off") {
        off = false
    } else {
        const err = new RSCError("invalid on off request", RSCError.rscErr.INVALID_REQUEST);
        err.addField("on_off", RSCError.rscFieldErr.INVALID_REQUEST);
        return next(err);
    }
    socketFile.socketOnOff(socket_id, on).then(() => {
        res.json(new RSCResponse([]).okResponse());
    }).catch(err => {next(err)});
});

app.get('/login', (req, res, next) => {
    if(req.user) return;
    return next();
});

app.post('/logout', (req, res) => {
    if(!req.user) return next(new RSCError("permission denied", 
                        RSCError.rscError.PERMISSION_DENIED));
    req.logout();
    return res.redirect('/login?status=logout')
});

app.post('/login', passport.authenticate('local', {
    successRediect: '/',
    failureRedirect: '/login?status=error'
}));


app.post('/signup', (req, res) => {

});

app.post('/admin', (req, res) => {

});

app.path('/admin', (req, res) => {

});

app.delete('/admin', (req, res) => {

});

//error handling middleware
app.use((err, req, res, next) => {
    if(typeof err === RSCError) {
        switch(err.type) {
            case RSCError.rscErr.NOT_FOUND:
                res.status(404);
                break;
            case RSCError.rscErr.SOCKET_ERROR:
                console.error(err.message());
                res.status(500);
                break;
            case RSCError.rscErr.INVALID_REQUEST:
                res.status(400);
                break;
            case RSCError.rscErr.PERMISSION_DENIED:
                res.status(403);
                res.redirect('/login?status=denied')
                return next();
            default:
                res.status(400);
        }
        res.json(err.getErrorReponse());
    }
    return next();
});


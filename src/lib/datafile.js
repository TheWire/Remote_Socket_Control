const fs = require('fs');
const path = require('path');
const { RSCError } = require('./rsc_error');

const DATA_PATH = "../../data/";

class DataFile {
    constructor(filePath, defaultObj={}) {
        this._filePath = filePath;
        this._defaultObj = defaultObj;
        this._dataObject = defaultObj;
    }

    /*  load data from file returns true if file exists
        false if file needed to be created
    */
    _loadData() {
        try {
            this._dataObject = require(this._filePath);
            return true;
        } catch (e) {
            if(e instanceof Error && e.code === "MODULE_NOT_FOUND") {
                this._dataObject = _makeSockObj();
                this._saveData();
                return false;
            }
        }
    }

    exists(field, key, value) {
        if(!this._dataObject.hasOwnProperty(field)) {
            return null;
        }
        for(const e in this._dataOject[field]) {
            if(e[key] === value) {
                return e;
            }
        }
        return null;
    }

    getData() {
        this._loadData();
        return this._dataObject;
    }

    saveData() {
        const jsn = JSON.stringify(this._dataObject);
        fs.writeFileSync(this._filePath, jsn);
    }

    removeData(field, key, id) {
        const data = this.getData();
        data[field] = data[field].filter((value, index, arr) => {
            return value != id;
        });
        this.saveData();
    }

    _incrementCount(countField) {
        this._dataObject[countField]++;
        this.saveData();
        return this._dataObject[countField];
    }
}

class SocketFile extends DataFile{
    constructor() {
        super(path.join(DATA_PATH, 'socket.json'), {
            default_repeat: 5,
            default_bits: 24,
            all_off_code: 1234,
            current_socket_id: 0,
            sockets:[]
        });
    }

    _checkSocketUnique(socket) {
        const rscErr = RSCError("invalid socket creat request", RSCError.rscErr.INVALID_REQUEST);
        if(this.exists("sockets","socket_name", socket.socket_name)) {rscErr.addField("socket_name", RSCError.rscFieldErr.NOT_UNIQUE)}
        if(this.exists("sockets", "on_code", socket.on_code)) {rscErr.addField("on_code", RSCError.rscFieldErr.NOT_UNIQUE)}
        if(this.exists("sockets", "off_code", socket.off_code)) {rscErr.addField("off_code", RSCError.rscFieldErr.NOT_UNIQUE)}
        return rscError;
    }

    addSocket(socket) {
        const retErr = this._checkSocketUnique(socket);
        if(socket.bits < 4 || socket.bits > 256) {
            retErr.addField("bits", RSCError.rscFieldErr.INVALID_NUMBER);
        }
        if(retErr.fields.length > 0) {
            throw retErr;
        }
        socket.socket_id = this._incrementCount("current_socket_id");
        this._dataObject.sockets.push(socket);
        this.saveData();
    }

    getSocket(socket_id) {
        return this.exists("sockets", "socket_id", socket_id);
    }

    getSocketByName(socket_name) {
        return this.exists("sockets", "socket_name", socket_name);
    }

    deleteSocket(socket_id) {
        this.removeData("sockets", "socket_id", socket_id);
    }

    socketOnOff(socket_id, on) {
        const on_off_field = on_off ? "on_code" : "off_code";
        const socket = this.getSocket(socket_id);
        if(socket) {
            return sendCommand(this._dataObject.pin, socket[on_off_field], 
                socket.bits ? socket.bits : this._dataObject.default_bits, 
                socket.repeat ? socket.repeat : this._dataObject.default_repeat);
        }
        const err = new RSCError("socket not found", RSCError.rscErr.NOT_FOUND);
        err.addField("socket_id", RSCError.rscFieldErr.NOT_FOUND);
        return Promise.reject(err);
    }

}

class UserFile extends DataFile {

    static permissions = [
        "NONE",
        "USER",
        "ADMIN"
    ];

    constructor() {
        super(path.join(DATA_PATH, 'users.json'),
        {
            current_user_id: 0,
            users: [
                {
                    id: 0,
                    username: "admin",
                    permission: "ADMIN"
                },
            ]
        });
    }

    async addUser(username, password) {
        const ret = [];
        if(this.exists("users", "username", username)) {
            ret.push({username: "ALREADY_EXISTS"});
        }
        if(password.length < 8 || password.length > 30) {
            ret.push({password: "INVALID_LENGTH"});
        }
        if(ret.length > 0) {
            return ret;
        }
        const hash = await bcrypt.hash(password, SALT_ROUNDS);
        const user = {
            id: this._incrementUsers("current_user_id"),
            username: username,
            password = hash,
            permission: "NONE",
        }
        this._dataObject.users.push(user);
        this.saveData;

    }

    getUserByName(username) {
        return user = this.exists("users", "username", username);
    }

    getUserById(id) {
        return user = this.exists("users", "user_id", id);
    }

    checkPassword(user, password) {
        return bcrypt.compare(password, user.password);
    }

    setUserPermission(user, permission) {
        if(UserFile.permissions.includes(permission)) {
            user.permission = permission;
            return;
        }
        const err = new RSCError("invalid permission", RSCError.rscErr.INVALID_REQUEST);
        err.addField("permission", RSCError.rscFieldErr.INVALID_VALUE);
        return err;
    }

    removeUser(user) {
        this.removeData("users", "user_id", user.user_id);
    }
}

class SessionFile extends DataFile {
    constructor() {
        super(DATA_PATH, "sesssion.json",{
            sessions: [],
        });
    }

    get(sid, callback) {
        const data = this.getData();
        for(i in data) {
            if(data[i].session_id == sid) {
                callback(null, data[i].session);
            }
        }
        callback(new Error("Session not found"));
    }

    set(sid, session) {
        const data = this.getData();
        const ses = {
            session_id: sid,
            session: session
        }
        data.sessions.push(ses)
    }

    destroy(sid, callback) {
        this.removeData("session", "session_id", sid);
        callback();
    }   
}

module.exports = {
    DataFile : DataFile,
    SessionFile : SessionFile,
    UserFile: UserFile,
    SocketFile : SocketFile,
}
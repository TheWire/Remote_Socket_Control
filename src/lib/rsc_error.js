class RSCResponse {
    constructor(fields) {
        this._fields = fields;
    }
    errResponse() {
        return {rsc_error: this._fields};
    }

    okResponse() {
        return {rsc_ok: this._fields};
    }
}
class RSCError extends Error {

    static rscErr = {
        NOT_FOUND: 0,
        SOCKET_ERROR: 1,
        INVALID_REQUEST: 2,
        PERMISSION_DENIED: 3,
    };

    static rscFieldErr = {
        NOT_UNIQUE: 0,
        NOT_PROVIDED: 1,
        NOT_FOUND: 2,
        INVALID_VALUE: 3,
    };

    constructor(message, type) {
        super(message);
        this._checkErrorValid(type, RSCError.rscErr);
        this.type = type;
        this.fields = []
    }

    addField(field, type) {
        this._checkErrorValid(type, RSCError.rscFieldErr);
        this.fields.push({field: field, type: type});
    }

    getErrorReponse() {
        return new RSCResponse(this.fields);
    }

    _checkErrorValid(type, error) {
        for(e in error) {
            if(type === error[e]) {
                return;
            }
        }
        throw Error("invalid error type");
    }
}

module.exports = {
    RSCResponse : RSCResponse,
    RSCError : RSCError,
}
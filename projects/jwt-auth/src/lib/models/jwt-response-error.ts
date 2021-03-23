export class JwtResponseError extends Error {

    private _message: string;
    private _detailedMessage: string;
    private _status?: number;

    public get message() { return this._message; }
    public get detailedMessage() { return this._detailedMessage; }
    public get status() { return this._status; }
    public get isUnhautorized() { return this._status == 401; }

    constructor(message: string, detailedMessage: string, status: number = null) {
        super(message);
        this._message = message;
        this._detailedMessage = detailedMessage;
        this._status = status;
        Object.setPrototypeOf(this, JwtResponseError.prototype);
    }
}
export class JwtResponseError extends Error {

    private _message: string;
    private _detailedMessage: string;

    public get message() { return this._message; }
    public get detailedMessage() { return this._detailedMessage; }

    constructor(message: string, detailedMessage: string) {
        super(message);
        this._message = message;
        this._detailedMessage = detailedMessage;
        Object.setPrototypeOf(this, JwtResponseError.prototype);
    }
}
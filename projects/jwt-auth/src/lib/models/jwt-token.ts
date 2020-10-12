import * as moment_ from "moment";

const moment = moment_;

export class JwtToken {
    username: string;
    email: string;
    token: string;
    expires: moment.Moment;
    refreshToken: string;
    refreshTokenExpiration: moment.Moment;
}

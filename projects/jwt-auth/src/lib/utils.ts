export class Utils {

    static isDefinedAndNotNull(variable: any) {
        return !Utils.isUndefinedOrNull(variable);
    }

    static isUndefinedOrNull(variable: any) {
        return (typeof variable === undefined || variable === undefined || variable === null)
    }

    static isFunction(func: any) {
        return Utils.isDefinedAndNotNull && (typeof func === 'function');
    }

    static generateRandomString(length: number) {
        var result = '';
        var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        var charactersLength = characters.length;
        for (var i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * charactersLength));
        }
        return result;
    }
}
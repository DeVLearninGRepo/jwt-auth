export const ERROR_INVALID_TOKEN = 'invalid_token';

export class WWWAuthenticateMessage {
    scheme: string;
    message: string;
    error: string;
    description: string;

    constructor(message: string, error: string, description: string) {
        this.scheme = "Bearer";
        this.message = message;
        this.error = error;
        this.description = description;
    }
}

export class WWWAuthenticateMessageFactory {
    public static create(content: string) {
        if (content == null) return <WWWAuthenticateMessage>null;

        if (!content.startsWith("bearer")) throw new Error("Unmanaged scheme authentication");

        const parts = content.split(' ');
        let message = null;
        let error = null;
        let description = null;

        parts.forEach(part => {
            if (part.startsWith("error")) {
                error = part.split('=')[1].replace("\"", '');
            } else if (part.startsWith("error_description")) {
                description = part.split('=')[1].replace("\"", '');
            }
        });

        // error="invalid_token",
        // error_description="The access token expired"
        message = content[0];

        return new WWWAuthenticateMessage(message, error, description);
    }
}

/*
https://www.rfc-editor.org/rfc/rfc6750#section-3

invalid_request
    The request is missing a required parameter, includes an
    unsupported parameter or parameter value, repeats the same
    parameter, uses more than one method for including an access
    token, or is otherwise malformed.  The resource server SHOULD
    respond with the HTTP 400 (Bad Request) status code.

invalid_token
    The access token provided is expired, revoked, malformed, or
    invalid for other reasons.  The resource SHOULD respond with
    the HTTP 401 (Unauthorized) status code.  The client MAY
    request a new access token and retry the protected resource
    request.

insufficient_scope
    The request requires higher privileges than provided by the
    access token.  The resource server SHOULD respond with the HTTP
    403 (Forbidden) status code and MAY include the "scope"
    attribute with the scope necessary to access the protected
    resource.
*/
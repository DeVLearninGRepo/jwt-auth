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
    public create(content: string) {
        if (content == null) return <WWWAuthenticateMessage>null;

        if (!content.startsWith("bearer")) throw new Error("Unmanaged scheme authentication");

        const parts = content.split(' ');
        let message = null;
        let error = null;
        let description = null;

        parts.forEach(part => {
            if (part.startsWith("error")) {
                error = part.split('=')[1].replace("\"", '');
            } else if (part.startsWith("error")) {
                description = part.split('=')[1].replace("\"", '');
            }
        });

        if(error == null) message = content[0];




        //let result = new WWWAuthenticateMessage();
    }
}
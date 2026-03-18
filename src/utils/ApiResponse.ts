export class ApiResponse {
    public success: boolean;
    public message: string;
    public data: any;
    public statusCode: number;
    constructor(message: string, data: any, statusCode: number) {
        this.success = true;
        this.message = message;
        this.data = data;
        this.statusCode = statusCode;
    }
}   
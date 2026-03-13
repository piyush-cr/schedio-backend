import { createClient } from 'redis';


export const redisConfig = {
    host: 'redis-17794.crce182.ap-south-1-1.ec2.cloud.redislabs.com',
    port: 17794,
    password: "b4E3vRPrHoiclI7ElStJIwcUvUjtfdJe"
}

export const redisConnection = createClient({
    username: 'default',
    password: 'b4E3vRPrHoiclI7ElStJIwcUvUjtfdJe',
    socket: {
        host: 'redis-17794.crce182.ap-south-1-1.ec2.cloud.redislabs.com',
        port: 17794
    }
});

redisConnection.on('error', err => console.log('Redis Client Error', err));
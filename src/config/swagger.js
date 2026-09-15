const swaggerJSDoc = require('swagger-jsdoc');
const { env } = require('./env');

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Ticketing Tool Web API Documentation',
      version: '1.0.0',
      description: 'Web-focused full-stack API template',
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}/api`,
        description: 'Local Development Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/routes/**/*.js', './src/controllers/**/*.js'],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

module.exports = { swaggerSpec };

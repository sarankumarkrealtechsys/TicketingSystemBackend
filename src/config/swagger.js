const swaggerJSDoc = require("swagger-jsdoc");
const { env } = require("./env");

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Ticketing Tool Web API Documentation",
      version: "1.0.0",
      description: "Web-focused full-stack API template",
    },
    servers: [
      {
        url: "/api",
        description: "API Server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: ["./src/routes/**/*.js", "./src/controllers/**/*.js"],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

module.exports = { swaggerSpec };

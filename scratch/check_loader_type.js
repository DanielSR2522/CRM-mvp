const { Loader } = require('@googlemaps/js-api-loader');

const instance = new Loader({ apiKey: 'test', libraries: ['places'] });
console.log('Loader methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(instance)));

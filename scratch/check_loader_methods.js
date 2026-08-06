const { Loader } = require('@googlemaps/js-api-loader');

const loader = new Loader({
  apiKey: 'test',
  version: 'weekly',
  libraries: ['places']
});

console.log('Loader methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(loader)));

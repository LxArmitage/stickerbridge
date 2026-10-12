/** Pruebas del dominio puro: sin React Native, sin red, sin dispositivo. */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/pruebas/**/*.test.ts'],
  transform: {
    '^.+\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.pruebas.json' }],
  },
};

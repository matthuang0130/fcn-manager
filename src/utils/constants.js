// src/utils/constants.js

export const DEFAULT_CLIENTS = [{ id: 'c1', name: '預設投資人' }];

export const INITIAL_POSITIONS = [
  {
    id: 1, clientId: 'c1', productName: "FCN Tech SNMSELN02384", issuer: "GS", nominal: 100000, currency: "USD", couponRate: 12.5,
    strikeDate: "2024-01-15", koObservationStartDate: "2024-04-15", tenor: "6 個月", maturityDate: "2024-07-15",
    koLevel: 105, kiLevel: 70, strikeLevel: 100, koType: "Daily", stepDownRate: 0,
    underlyings: [{ ticker: "NVDA", entryPrice: 550, memoryKO: false }, { ticker: "AMD", entryPrice: 140, memoryKO: false }, { ticker: "TSLA", entryPrice: 200 }, { ticker: "MSFT", entryPrice: 400, memoryKO: false }], status: "Active"
  }
];

export const DEFAULT_MARKET_PRICES = { 
    "NVDA": 610.50, "AMD": 135.20, "TSLA": 190.00, "RIVN": 11.50, 
    "AAPL": 175.00, "MSFT": 405.00, "7203": 3550, "7267": 1700, "COIN": 165.00 
};

export const DEFAULT_FORM_STATE = {
  productName: "", issuer: "", nominal: 10000, currency: "USD", couponRate: 10,
  koLevel: 100, kiLevel: 70, strikeLevel: 100, koType: "Daily", stepDownRate: 5,
  strikeDate: new Date().toISOString().split('T')[0],
  koObservationStartDate: "", tenor: "6 個月", maturityDate: ""
};
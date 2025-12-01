/**
 * Demo Packs - Sample pack definitions for development/testing
 * 
 * These demonstrate the pack structure and provide default packs
 * for the application. In production, packs would be loaded from
 * a registry or configuration service.
 */

import type { UIPackDefinition } from './pack-types';

/**
 * Breweries pack - CRM features for craft breweries
 */
export const breweriesPack: UIPackDefinition = {
  meta: {
    id: 'breweries',
    name: 'Breweries',
    version: '1.0.0',
    description: 'CRM features tailored for craft breweries',
  },
  features: {
    'brew-products': {
      id: 'brew-products',
      label: 'Product Management',
      description: 'Manage beer products, ABV, duty bands',
      enabledByDefault: true,
    },
    'brew-inventory': {
      id: 'brew-inventory',
      label: 'Inventory Tracking',
      description: 'Track stock levels and batch history',
      enabledByDefault: true,
    },
    'brew-containers': {
      id: 'brew-containers',
      label: 'Container Management',
      description: 'Track casks, kegs, and returnable containers',
      enabledByDefault: true,
    },
    'brew-orders': {
      id: 'brew-orders',
      label: 'Order Management',
      description: 'Manage customer orders and deliveries',
      enabledByDefault: true,
    },
    'brew-duty-reports': {
      id: 'brew-duty-reports',
      label: 'Duty Reports',
      description: 'Generate HMRC duty reports',
      enabledByDefault: true,
    },
  },
};

/**
 * Coffee Roasteries pack - CRM features for coffee roasters
 */
export const coffeeRoasteriesPack: UIPackDefinition = {
  meta: {
    id: 'coffee-roasteries',
    name: 'Coffee Roasteries',
    version: '1.0.0',
    description: 'CRM features tailored for specialty coffee roasters',
  },
  features: {
    'coffee-products': {
      id: 'coffee-products',
      label: 'Coffee Products',
      description: 'Manage coffee origins, blends, and roast profiles',
      enabledByDefault: true,
    },
    'coffee-inventory': {
      id: 'coffee-inventory',
      label: 'Green Bean Inventory',
      description: 'Track green bean stock and lot numbers',
      enabledByDefault: true,
    },
    'coffee-roasting': {
      id: 'coffee-roasting',
      label: 'Roast Logs',
      description: 'Track roasting batches and profiles',
      enabledByDefault: true,
    },
    'coffee-subscriptions': {
      id: 'coffee-subscriptions',
      label: 'Subscriptions',
      description: 'Manage recurring coffee subscriptions',
      enabledByDefault: false, // Premium feature
    },
  },
};

/**
 * All demo packs available in the system
 */
export const demoPacks: UIPackDefinition[] = [
  breweriesPack,
  coffeeRoasteriesPack,
];


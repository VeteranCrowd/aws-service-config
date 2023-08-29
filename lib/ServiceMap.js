// npm imports
import _ from 'lodash';

// lib imports
import { ServiceConfig } from './ServiceConfig.js';

class ServiceMap {
  static #instance;

  static get instance() {
    if (!this.#instance) this.#instance = new ServiceMap();
    return this.#instance;
  }

  async init(config, options = {}) {
    // Clear existing services.
    _.forOwn(this, (value, key) => _.unset(this, key));

    // Resolve & map all services.
    const serviceConfig = new ServiceConfig(config);
    const serviceTokens = _.keys(config);

    const clients = (
      await Promise.all(
        serviceTokens.map((serviceToken) =>
          serviceConfig.getClient(serviceToken, options)
        )
      )
    ).map(
      // If a service fails to resolve, map service config.
      (client, i) => (_.isEmpty(client) ? config[serviceTokens[i]] : client)
    );

    // Assign services to instance.
    _.assign(this, _.fromPairs(_.zip(serviceTokens, clients)));
  }
}

export const serviceMap = ServiceMap.instance;

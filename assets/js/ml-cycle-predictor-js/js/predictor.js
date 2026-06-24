import { prepareInputDataDos, normalizeInput, denormalizeOutput, prepareInputDataFreestyle } from './utils.js';

let model = {};
fetch('./assets/js/ml-cycle-predictor-js/model/best_cycle_predictor.json')
  .then(response => response.json())
  .then(data => {
    model = data;
  });

export function predit_delta_cycle_dos(){
    // 1. Charger le modèle et la normalisation
    const neatModel = model[$("#run_part1").val()];
    let input_features;
    // 2. Préparer les features
    if ($("#run_part1").val() === "freestyle") {
        input_features = prepareInputDataFreestyle();
    } else if ($("#run_part1").val() === "dos") {
        input_features = prepareInputDataDos(); // tableau de features
    }
    else {
        return(1);
    }
    const mean = neatModel.normalization.mean;
    const std = neatModel.normalization.std;
    const y_mean = neatModel.normalization.y_mean_val;
    const y_std = neatModel.normalization.y_std_val;
    
    // 3. Normaliser les features avec la fonction dédiée;
    let input_norm = normalizeInput(input_features, mean, std);

    // 4. Passer dans le réseau NEAT
    let output_norm = runNeatNetwork(input_norm, neatModel.network);
    // 5. Dénormaliser la sortie
    let delta_pred = denormalizeOutput(output_norm, y_mean, y_std);
    return delta_pred;
}



function tanh_activation(z) {
  z = Math.max(-60.0, Math.min(60.0, 2.5 * z));
  return Math.tanh(z);
}

const activations = {
  tanh: tanh_activation,
  // autres si besoin
};

function runNeatNetwork(inputNorm,net) {
  const nodeOutputs = {};
  const nodes = net.nodes;
  const connections = net.connections;

  // Initialisation des entrées
  for (let i = 0; i < inputNorm.length; i++) {
    const nodeId = -(inputNorm.length - i);
    nodeOutputs[nodeId] = inputNorm[i];
  }

  function topologicalSort(nodes, connections) {
    const inDegree = {};
    const graph = {};
    nodes.forEach(n => {
      inDegree[n.id] = 0;
      graph[n.id] = [];
    });
    connections.forEach(conn => {
      graph[conn.in] = graph[conn.in] || [];
      graph[conn.in].push(conn.out);
      inDegree[conn.out] = (inDegree[conn.out] || 0) + 1;
    });
    const order = [];
    const visited = {};
    function visit(id) {
      if (visited[id]) return;
      visited[id] = true;
      (graph[id] || []).forEach(visit);
      order.unshift(id);
    }
    nodes.forEach(n => visit(n.id));
    return order;
  }

  const nodeOrder = topologicalSort(nodes, connections);
  for (const nodeId of nodeOrder) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) continue;
    const bias = node.bias;
    const activationName = node.activation;
    const response = node.response !== undefined ? node.response : 1;
    // Connexions entrantes
    const incoming = connections.filter(conn => conn.out === nodeId);
    let s = 0;
    for (const conn of incoming) {
      const srcId = conn.in;
      const weight = conn.weight;
      const srcVal = nodeOutputs[srcId];
      s += srcVal * weight;
    }
    const pre_act = bias + response * s;
    const activationFn = activations[activationName];
    if (typeof activationFn !== 'function') {
      throw new Error(`Activation function "${activationName}" is not defined`);
    }
    const out = activationFn(pre_act);;
    nodeOutputs[nodeId] = out;
  }
  return nodeOutputs[0];
}
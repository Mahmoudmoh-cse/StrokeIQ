/**
 * @file side_views.js
 * @brief Ce fichier contient les fonctions pour afficher les statistiques du nageur sélectionné ainsi que les barres de l'annotation
 */

import { megaData, curr_swims, frame_rate, turn_distances, turn_times, pool_size } from './loader.js';
import { selected_swim,sec_to_timestr, focus_time_input, focusout_time_input, min_sec_ms_to_sec, timestr_to_min_sec_ms, updateSwimSwitch } from './refactor-script.js';
import { add_element_to_data, currate_events } from './data_handler.js';
import { updateTable } from './main.js';
import { recalculateCycleMetrics } from './race_distance.js';






/**
 * permet d'afficher les statistiques du nageur sélectionné dans les menus à droite de la vidéo
 * @param {Array} data - tableau de données du nageur
 * @param {*} D3Instance /sert principalement pour les tests automatisés
 */
export function draw_stats(data, D3Instance = d3) {
    recalculateCycleMetrics(data, frame_rate);
    draw_traj(data,D3Instance)
    let tdat = data.filter(d => d.mode == "cycle")
    drawCycleBars(tdat)
    drawCycleTimeBars(tdat);
}





/**
 * créé le tableau d'entrée de temps pour le nageur sélectionné
 * @function construct_time_entry
 * @param {void} - utilise les variables globales 
 * @var {Array} turn_distances - tableau des distances de virage
 * @returns {void}- les modifications sont faites directement dans le DOM
 */
export function construct_time_entry(){
    let tableBody = document.getElementById("temps_officiels").getElementsByTagName('tbody')[0];
    tableBody.innerHTML = `<tr>
        <td class="tg-0lax no-border" colspan="2"><button id="save_data_entry" class="save-data-entry-btn">Save</button></td>
    </tr>`;
    for(let i = 0; i < turn_distances.length; i ++){
        let nwRow = tableBody.insertRow(i);
        
        let title = turn_distances[i].toString() + " m";
        let id = turn_distances[i].toString()+"m";
        if(i == 0){
            title = "Reaction";
            id = "reac";
        }
        nwRow.insertCell().appendChild(document.createTextNode(title));

        let input = document.createElement("input");
        input.type = "text";
        input.className = "time_input";
        input.id = "ti_"+id;
        input.placeholder = "00:00.00";
        nwRow.insertCell().appendChild(input);
    }

    $(".time_input").on("focus", focus_time_input);
    $(".time_input").on("focusout",function(e){focusout_time_input(e)});
    document.getElementById("save_data_entry").addEventListener("click", save_data_entry_click);
}



     

/**
 * permet de mettre à jour les temps de passage du nageur sélectionné autant visuellement que dans les données
 * @function set_placeholder_of_time_entry
 * @var {int} selected_swim - id du nageur sélectionné
 * @var {array}  turn_distances- les distances de virage
 * @var {array} turn_times - les temps de passage
 * @var {int} id - id de l'évenement, une certains virage ou le temps de réaction    
 */
export function set_placeholder_of_time_entry(){
    for(let i = 0; i < turn_distances.length; i ++){
        let time = turn_times[selected_swim][turn_distances[i]];
        if(time === undefined){
            time = 0;
        }
        let id = "ti_"+turn_distances[i].toString()+"m";
        if( i == 0 ){
            id = "ti_reac";
        }
        document.getElementById(id).placeholder = sec_to_timestr(time);
        document.getElementById(id).value = "";
    }
}




/** 
 * Permet de changer de nageur sélectionné ainsi que de charger les données de ce nageur si elles existent
 * @var {int} id - id du nageur sélectionné
 * @var {array} curr_swims - tableau des données des nageurs 
*/
export function update_swimmer(id) {
    $(".swname_pool_highlight").toggleClass("swname_pool_highlight");
    $(".swname_pool[swim='" + id + "']").toggleClass("swname_pool_highlight");

    // Synchroniser swim_switch avec le nageur sélectionné
    updateSwimSwitch();

    let data = curr_swims[id];

    if (data.length > 0) {
        draw_traj(data);
        let tdat = data.filter(d => d.mode == "cycle")

        if (tdat.length > 0) {
            drawCycleBars(tdat);
            drawCycleTimeBars(tdat);
        }

    }

}

/**
 * @brief Dessine la trajectoire du nageur sélectionné dans le graphique latéral
 * Affiche la progression temporelle du nageur avec ses annotations sur un graphique D3
 * 
 * @param {array} data Données d'annotation du nageur
 * @param {object} D3Instance Instance D3 à utiliser (par défaut d3 global)
 */
export function draw_traj(data, D3Instance = d3) {;
    data = data.slice();
    let svg = D3Instance.select("#stats")

    const marginLeft = 30;
    svg.selectAll("*").remove()

    if(data.length > 0){
        let maxFrame = data[data.length - 1].frame_number;
        for (let i = 0; i < data.length - 1; i++) {
            data[i]["dist"] = Math.abs(data[i].x - data[i + 1].x);
        }

        let xscale = D3Instance.scaleLinear([0, maxFrame], [marginLeft, 190]);
        let yscale = D3Instance.scaleLinear([parseInt(megaData[0].distance), 0], [25, 180]);
        svg.selectAll(".cycleDots")
            .data(data)
            .enter()
            .append("circle")
            .attr("class", "cycleDots")
            .attr("cx", d => xscale(d.frameId))
            .attr("cy", d => yscale(d.cumul))
            .attr("r", 4)
            .attr("num", (_, i) => i)
            .attr("swim", selected_swim)
            .style("fill", "rgba(11, 99, 206, 1)")
            .style("stroke", "#555555");
        xscale = D3Instance.scaleLinear([0, maxFrame / frame_rate], [22, 190]);

        var x_axis = D3Instance.axisBottom()
            .scale(xscale)
            .ticks();

        svg.append("g")
            .attr("transform", "translate(0,180)")
            .call(x_axis);

        svg.append("g")
            .attr("transform", "translate(" + marginLeft + ",0)")      // This controls the vertical position of the Axis
            .call(D3Instance.axisLeft(yscale));
    }
}

/**
 * @brief Dessine les barres de cycles dans le graphique de vérification
 * Affiche les cycles de nage sous forme de barres colorées selon leur type
 * 
 * @param {array} data Données des cycles du nageur
 * @param {object} d3Instance Instance D3 à utiliser (par défaut d3 global)
 */
export function drawCycleBars(data, d3Instance = d3) {
    const marginLeft = 30;
    recalculateCycleMetrics(data, frame_rate);
    const metricData = data
        .map((event) => ({ event, value: Number(event["amplitude (m)"]) }))
        .filter((row) => Number.isFinite(row.value) && row.value > 0);
    let svg = d3Instance.select("#cyclebar");
    svg.selectAll("*").remove();

    if (metricData.length > 0) {
        const maxDistance = Math.max(...metricData.map((d) => Number(d.value) || 0), 0);
        let y = d3Instance.scaleLinear([0, Math.max(maxDistance, 0.1)], [174, 20]).nice().clamp(true);
        let x = d3Instance.scaleBand()
            .domain(d3Instance.range(metricData.length))
            .range([marginLeft, 190])
            .padding(0.2);
            var x_axis = g => {
                return g
                    .attr("transform", `translate(0,${180 - 5})`)
                    .call(d3Instance.axisBottom(x).tickValues(x.domain().filter(function (d) {
                        return !(d % 5);
                    })));
            };

        svg.append("g")
            .attr("transform", "translate(0,180)")
            .call(x_axis);

        let yAxis = g => g
            .attr("transform", `translate(${marginLeft},0)`)
            .call(d3Instance.axisLeft(y))
            .call(g => g.select(".domain").remove());

        svg.append("g")
            .attr("transform", "translate(40,0)")
            .call(yAxis);

        svg.append("g")
            .attr("class", "bars")
            .attr("fill", "rgba(11, 99, 206, 1)")
            .selectAll("rect")
            .data(metricData)
            .join("rect")
            .attr("swim", selected_swim)
            .attr("num", (d) => curr_swims[selected_swim].indexOf(d.event))
            .attr("x", (d, i) => x(i))
            .attr("y", (d) => y(d.value))
            .attr("height", d => y(0) - y(d.value))
            .attr("width", x.bandwidth());
    }
}

/**
 * @brief Dessine les barres temporelles des cycles dans le graphique de vérification
 * Affiche la durée de chaque cycle sous forme de barres dans un graphique séparé
 * 
 * @param {array} data Données des cycles avec leurs durées
 */
export function drawCycleTimeBars(data) {
    recalculateCycleMetrics(data, frame_rate);
    const metricData = data
        .map((event) => ({ event, value: Number(event["frequence (cylce/min)"]) }))
        .filter((row) => Number.isFinite(row.value) && row.value > 0);
    let svg = d3.select("#cycle_stats");
    svg.selectAll("*").remove();
    const marginLeft = 30

    if(metricData.length > 0){
        const maxDuration = Math.max(...metricData.map((d) => Number(d.value) || 0), 0);
        let y = d3.scaleLinear([0, Math.max(maxDuration, 0.1)], [174, 20]).nice().clamp(true);

        let x = d3.scaleBand()
            .domain(d3.range(metricData.length))
            .range([marginLeft, 190])
            .padding(0.2)

        var x_axis = g => g
            .attr("transform", `translate(0,${180 - 5})`)
            .call(d3.axisBottom(x).tickValues(x.domain().filter(function (d) {
                return !(d % 5)
            })))

        svg.append("g")
            .attr("transform", "translate(0,180)")
            .call(x_axis);

        let yAxis = g => g
            .attr("transform", `translate(${marginLeft},0)`)
            .call(d3.axisLeft(y))
            .call(g => g.select(".domain").remove())

        svg.append("g")
            .attr("transform", "translate(10,0)")
            .call(yAxis);

        svg.append("g")
            .attr("class", "bars")
            .attr("fill", "rgba(11, 99, 206, 1)")
            .selectAll("rect")
            .data(metricData)
            .join("rect")
            .attr("swim", selected_swim)
            .attr("num", (d) => curr_swims[selected_swim].indexOf(d.event))
            .attr("x", (d, i) => x(i))
            .attr("y", (d) => y(d.value))
            .attr("height", d => y(0) - y(d.value))
            .attr("width", x.bandwidth());
    }
}


function save_data_entry_click(){
    let dist = turn_distances; 
    let name_modes=["reaction"];
    for(let i=0;i<dist.length-1;i++){ 
    if(i!==dist.length-2){name_modes.push("turn");} 
    else{ name_modes.push("finish"); } }
    let values = [];
    for(let i = 0; i < turn_distances.length; i ++){
        let id = "ti_"+turn_distances[i].toString()+"m"
        if( i == 0 ){
            id = "ti_reac";
        }
        if (document.getElementById(id).value.length > 0){
            let entered_value = min_sec_ms_to_sec(timestr_to_min_sec_ms(document.getElementById(id).value))
            values.push(entered_value)
        }else{
            values.push(undefined)
        }
    }
    for(let i = 0; i < dist.length ; i ++){
        if(values[i] !== undefined){
            let entered_data = curr_swims[selected_swim].filter(annotation => annotation.cumul == dist[i])
            let frameId_data = (values[i] * frame_rate)
            if(entered_data.length > 0 && entered_data[0].mode == name_modes[i]){
                let index = curr_swims[selected_swim].indexOf(entered_data[0])
                entered_data[0].frameId = frameId_data
                entered_data[0].frame_number = frameId_data
                curr_swims[selected_swim][index] = entered_data[0]
            }else{
                add_element_to_data({
                    "frame_number": parseInt(frameId_data),
                    "frameId": parseInt(frameId_data),
                    "x": pool_size[0]*(parseInt(dist[i]/pool_size[0])%2),
                    "y": null,
                    "swimmer": selected_swim,
                    "mode": name_modes[i],
                    "cumul": dist[i]
                },selected_swim)
            }
            turn_times[selected_swim][dist[i]] = values[i];
        }
    }
    updateTable()
    set_placeholder_of_time_entry()
    curr_swims[selected_swim] = currate_events(curr_swims[selected_swim])
}
if (typeof window !== 'undefined') { //utile pour les tests
    window.save_data_entry_click = save_data_entry_click;
}

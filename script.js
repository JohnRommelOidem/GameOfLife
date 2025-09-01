const canvas = document.getElementById("game-of-life");
const playBtn = document.getElementById("playBtn");
const stepBtn = document.getElementById("stepBtn");
const resetBtn = document.getElementById("resetBtn");
const sizeSlider = document.getElementById("sizeSlider");
const sizeInput = document.getElementById("sizeInput");
const initialSize = sizeSlider.value;
sizeInput.value = sizeSlider.value;
const speedSlider = document.getElementById("speedSlider");
const speedInput = document.getElementById("speedInput");
const initialSpeed = speedSlider.value;
speedInput.value = speedSlider.value;

let arraySize;
let probabilityArray;
let percentAlive;
const dpr = window.devicePixelRatio || 1;
let canvasSize = 800||Math.floor(
    (Math.min(window.innerHeight, window.innerWidth)) / arraySize
) * arraySize;
canvas.width = canvasSize*dpr;
canvas.height = canvasSize*dpr;
let isDrawing = false, stoppedCauseClicked = false, running = false, handle = null;

const ctx = canvas.getContext("2d");
const aliveColor = "black";
const deadColor = "white";
const changedCells = new Set();
let gameOfLife;
const gpu = new GPU.GPU();
const initialPercent = 20;

class GameOfLife {
    constructor(initialArray){
        this.array = initialArray.map(row=>row.map(p=>p<initialPercent/100?1:0));
        const arraySize = initialArray.length;
        this.cellSize = canvasSize/arraySize;
        this.kernelFunction = gpu.createKernel(function(array){
            let sum = 0;
            const size = this.output.x;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (!(dx == 0 && dy == 0)) {
                        sum += array[(this.thread.y + dy + size) % size][(this.thread.x + dx + size) % size]
                    }
                }
            }
            return (sum === 3 || (array[this.thread.y][this.thread.x] === 1 && sum === 2)) ? 1 : 0;
        }).setOutput([arraySize, arraySize]);
        this.draw();
    }
    draw(){
        this.array.forEach((row, y)=>{
            row.forEach((cellValue, x)=>{
                ctx.fillStyle = cellValue? aliveColor:deadColor;
                const x1 = Math.floor(x * this.cellSize);
                const y1 = Math.floor(y * this.cellSize);
                const x2 = Math.floor((x + 1) * this.cellSize);
                const y2 = Math.floor((y + 1) * this.cellSize);

                ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
            })
        })
    }
    drawChanged(oldArray){
        this.array.forEach((row, y)=>{
            row.forEach((cellValue, x)=>{
                if (cellValue != oldArray[y][x]){
                    ctx.fillStyle = cellValue? aliveColor:deadColor;
                    const x1 = Math.floor(x * this.cellSize);
                    const y1 = Math.floor(y * this.cellSize);
                    const x2 = Math.floor((x + 1) * this.cellSize);
                    const y2 = Math.floor((y + 1) * this.cellSize);

                    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
                }
            })
        })
    }
    iterate(){
        const oldArray = this.array
        this.array = this.kernelFunction(this.array);
        this.drawChanged(oldArray);
    }
    toggleCell(x, y){
        const newValue = this.array[y][x]^1;
        this.array[y][x] = newValue;
        ctx.fillStyle = newValue ? aliveColor:deadColor;
        const x1 = Math.floor(x * this.cellSize);
        const y1 = Math.floor(y * this.cellSize);
        const x2 = Math.floor((x + 1) * this.cellSize);
        const y2 = Math.floor((y + 1) * this.cellSize);

        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    }
}

function render(){
    arraySize = sizeSlider.value; 
    probabilityArray = Array.from(
        {length: arraySize},
        () => Array.from({length:arraySize}, ()=> Math.random())
    )
    cellSize = canvasSize/arraySize
    gameOfLife = new GameOfLife(probabilityArray, percentAlive);
}
render();

function cellChangeTouch(e){
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const indexX = Math.floor((e.clientX - rect.left) / (canvas.clientWidth/arraySize));
    const indexY = Math.floor((e.clientY - rect.top) / (canvas.clientHeight/arraySize));
    const cellKey = `${indexX},${indexY}`;
    changedCells.add(cellKey);
    gameOfLife.toggleCell(indexX, indexY);
    if (running){
        stop();
        stoppedCauseClicked = true;
    }
}

function cellChangeMove(e){
    const rect = canvas.getBoundingClientRect();
    const indexX = Math.floor((e.clientX - rect.left) / cellSize);
    const indexY = Math.floor((e.clientY - rect.top) / cellSize);
    const cellKey = `${indexX},${indexY}`;
    if (isDrawing && !changedCells.has(cellKey)) {
        gameOfLife.toggleCell(indexX, indexY);
        changedCells.add(cellKey);
    }
}

function cellChangeStop(){
    isDrawing = false;
    changedCells.clear();
    if (stoppedCauseClicked) {
        start();
        stoppedCauseClicked = false;
    }
}

canvas.addEventListener("mousedown", cellChangeTouch);
canvas.addEventListener("mouseup", cellChangeStop);
canvas.addEventListener("mouseleave", cellChangeStop);
canvas.addEventListener("mousemove",cellChangeMove);

function start() {
    running = true;
    handle = requestAnimationFrame(tick);
    playBtn.innerText = "Pause";
}

function stop() {
    running = false;
    if (handle) cancelAnimationFrame(handle);
    playBtn.innerText = "Play";
}

let lastTime = 0;
function tick(currentTime) {
    if (!running) return;
    if (currentTime-lastTime >=speedSlider.value){
        gameOfLife.iterate();
        lastTime = currentTime;
    }
    handle = requestAnimationFrame(tick);
}
function pausePlay(){
    if (!running) {
            start();
        } else{
            stop();
        };
}

window.addEventListener("keydown", (e) => {
    if (e.key == " ") {
        e.preventDefault();
        pausePlay();
    }
});

playBtn.addEventListener("click",pausePlay);
stepBtn.addEventListener("click", ()=>{
    gameOfLife.iterate();
    stop();
});
clearBtn.addEventListener("click",()=>{
    gameOfLife.array = Array.from({length: arraySize},() => Array.from({length:arraySize}, ()=>0));
    gameOfLife.draw();
    stop();
});
resetBtn.addEventListener("click", ()=>{
    render();
    stop();
    playBtn.innerText = "Play";
});
sizeSlider.addEventListener("input", ()=>{
    render();
    sizeInput.value=sizeSlider.value;
});
sizeInput.addEventListener("change", ()=>{
    let value = parseInt(sizeInput.value, 10);
    if (!isNaN(value)){
        sizeSlider.value = Math.min(sizeSlider.max, Math.max(sizeSlider.min, value));
        sizeInput.value = sizeSlider.value;
        render();
    } else {
        sizeSlider.value = initialSize;
        sizeInput.value = initialSize;
    }
});
speedSlider.addEventListener("input", ()=>{
    render();
    speedInput.value=speedSlider.value;
});
speedInput.addEventListener("change", ()=>{
    let value = parseInt(speedInput.value, 10);
    if (!isNaN(value)){
        speedSlider.value = Math.min(speedSlider.max, Math.max(speedSlider.min, value));
        speedInput.value = speedSlider.value;
        render();
    } else {
        speedSlider.value = initialSpeed;
        speedInput.value = initialSpeed;
    }
});
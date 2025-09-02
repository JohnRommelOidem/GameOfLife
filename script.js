const canvas = document.getElementById("game-of-life");
const ctx = canvas.getContext("2d");

const playBtn = document.getElementById("playBtn");
const stepBtn = document.getElementById("stepBtn");
const clearBtn = document.getElementById("clearBtn");
const resetBtn = document.getElementById("resetBtn");
const drawBtn = document.getElementById("drawBtn");

const sizeSlider = document.getElementById("sizeSlider");
const sizeInput = document.getElementById("sizeInput");
const speedSlider = document.getElementById("speedSlider");
const speedInput = document.getElementById("speedInput");

const initialSize = sizeSlider.value;
sizeInput.value = sizeSlider.value;
const initialSpeed = speedSlider.value;
speedInput.value = speedSlider.value;

const PADDING = 10;
const ALIVE_COLOR = "black";
const DEAD_COLOR = "white";
const INITIAL_PERCENT = 20;

let arraySize;
let gameOfLife;
let lastX, lastY;
let isDrawing = false; 
let stoppedCauseClicked = false; 
let running = false; 
let drawOrErase = true;
let handle;
let lastTime = 0;

const changedCells = new Set();
const gpu = new GPU.GPU();

class GameOfLife {
    constructor(array){
        this.array = array;
        this.arraySize = array.length;
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
        }).setOutput([this.arraySize, this.arraySize]);
        this.draw();
    }
    drawCell(x, y, aliveOrDead){
        ctx.fillStyle = aliveOrDead? ALIVE_COLOR:DEAD_COLOR;
        const x1 = Math.floor(x * cellSize);
        const y1 = Math.floor(y * cellSize);
        const x2 = Math.floor((x + 1) * cellSize);
        const y2 = Math.floor((y + 1) * cellSize);
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    }
    draw(){
        this.array.forEach((row, y)=>{
            row.forEach((cellValue, x)=>{
                this.drawCell(x, y, cellValue);
            })
        })
    }
    drawChanged(oldArray){
        this.array.forEach((row, y)=>{
            row.forEach((cellValue, x)=>{
                if (cellValue != oldArray[y][x]){
                    this.drawCell(x, y, cellValue);
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
        this.array[y][x] = drawOrErase ? 1:0;
        this.drawCell(x, y, drawOrErase);
    }
}

function render(){
    arraySize = sizeSlider.value; 
    const probabilityArray = Array.from(
        {length: arraySize},
        () => Array.from({length:arraySize}, ()=> Math.random())
    )
    const canvasSize = Math.min(Math.floor(
        (Math.min(window.innerHeight, window.innerWidth)-PADDING)
    ), 800)
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    cellSize = canvasSize/arraySize;
    gameOfLife = new GameOfLife(probabilityArray.map(row=>row.map(p=>p<INITIAL_PERCENT/100?1:0)));
    if (window.innerHeight>window.innerWidth){
        document.body.classList.add("portrait");
    } else {
        document.body.classList.remove("portrait");
    }
}

function getClientCoords(e){
    return e.touches?.[0] ? [e.touches[0].clientX, e.touches[0].clientY] : [e.clientX, e.clientY];
}

function cellChangeClick(e){
    e.preventDefault();
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    [clientX, clientY] = getClientCoords(e);
    const indexX = Math.floor((clientX - rect.left) / (canvas.clientWidth/arraySize));
    const indexY = Math.floor((clientY - rect.top) / (canvas.clientHeight/arraySize));
    const cellKey = `${indexX},${indexY}`;
    changedCells.add(cellKey);
    gameOfLife.toggleCell(indexX, indexY);
    if (running){
        stop();
        stoppedCauseClicked = true;
    }
}
function drawLineHorizontal(x0, y0, x1, y1){
    if (x0>x1){
        [x0, x1] = [x1, x0];
        [y0, y1] = [y1, y0];
    }
    let dx = x1-x0;
    let dy = y1-y0;
    let yi = 1;
    if (dy<0){
        yi = -1;
        dy *= -1;
    }
    let y = y0;
    let D = 2*dy-dx;
    for (let i=0;i<=dx;i++){
        gameOfLife.toggleCell(x0+i, y);
        if (D>=0){
            y+=yi;
            D-=2*dx;
        }
        D+=2*dy;
    }
}
function drawLineVertical(x0, y0, x1, y1){
    if (y0>y1){
        [x0, x1] = [x1, x0];
        [y0, y1] = [y1, y0];
    }
    let dx = x1-x0;
    let dy = y1-y0;
    let xi = 1;
    if (dx<0){
        xi = -1;
        dx *= -1;
    }
    let x = x0;
    let D = 2*dx-dy;
    for (let i=0;i<=dy;i++){
        gameOfLife.toggleCell(x, y0+i);
        if (D>=0){
            x+=xi;
            D-=2*dy;
        }
        D+=2*dx;
    }
}

function drawLine(x0, y0, x1, y1){
    let dx = Math.abs(x1-x0);
    let dy = Math.abs(y1-y0);
    let xi = x0<x1?1:-1;
    let yi = y0<y1?1:-1;
    let error = dx-dy;
    while(true){
        gameOfLife.toggleCell(x0, y0);
        if (x0==x1&&y0==y1) break;
        if (2*error>-dy){
            error-=dy;
            x0+=xi;
        }
        if (2*error<dx){
            error+=dx;
            y0+=yi;
        }
    }
}

function cellChangeMove(e){
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const [clientX, clientY] = getClientCoords(e);
    const indexX = Math.floor((clientX - rect.left) / cellSize);
    const indexY = Math.floor((clientY - rect.top) / cellSize);
    const cellKey = `${indexX},${indexY}`;
    if (isDrawing && !changedCells.has(cellKey)) {
        if (lastX){
            drawLine(lastX, lastY, indexX, indexY);
        } else {
            gameOfLife.toggleCell(indexX, indexY);
        }
            lastX = indexX;
            lastY = indexY;
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
    lastX = null;
    lastY = null;
}

canvas.addEventListener("mousedown", cellChangeClick);
canvas.addEventListener("mouseup", cellChangeStop);
canvas.addEventListener("mouseleave", cellChangeStop);
canvas.addEventListener("mousemove",cellChangeMove);

canvas.addEventListener("touchstart", (e)=>{
    cellChangeClick(e);
    document.body.style.overscrollBehavior = "contain";
}, {passive:false});
canvas.addEventListener("touchend", (e)=>{
    e.preventDefault();
    cellChangeStop();
    document.body.style.overscrollBehavior = "";
}, {passive:false});
canvas.addEventListener("touchmove",cellChangeMove, {passive:false});

function start() {
    running = true;
    handle = requestAnimationFrame(loop);
    playBtn.innerText = "Pause";
}

function stop() {
    running = false;
    if (handle) cancelAnimationFrame(handle);
    playBtn.innerText = "Play";
}

function loop(currentTime) {
    if (!running) return;
    if (currentTime-lastTime >=speedSlider.value){
        gameOfLife.iterate();
        lastTime = currentTime;
    }
    handle = requestAnimationFrame(loop);
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
});
drawBtn.addEventListener("click",()=>{
    drawBtn.innerText = drawOrErase?"Draw":"Erase";
    drawOrErase = !drawOrErase;
})

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
    speedInput.value=speedSlider.value;
});
speedInput.addEventListener("change", ()=>{
    let value = parseInt(speedInput.value, 10);
    if (!isNaN(value)){
        speedSlider.value = Math.min(speedSlider.max, Math.max(speedSlider.min, value));
        speedInput.value = speedSlider.value;
    } else {
        speedSlider.value = initialSpeed;
        speedInput.value = initialSpeed;
    }
});
window.addEventListener("resize", ()=>{
    const canvasSize = Math.min(Math.floor(
        (Math.min(window.innerHeight, window.innerWidth)-PADDING)
    ), 800)
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    cellSize = canvasSize/arraySize;
    gameOfLife = new GameOfLife(gameOfLife.array);
    if (window.innerHeight>window.innerWidth){
        document.body.classList.add("portrait");
    } else {
        document.body.classList.remove("portrait");
    }
});

render();
-- Setpoint panel: a touchscreen that sets a target value, shows the measured
-- one beside it, and drives an output with a simple proportional controller.
-- Written for the minifier tests: long names, locals, closures, tables.

local targetValue = property.getNumber("Default Target")
local controlGain = 0.15
local historyLength = 24
local measuredHistory = {}
local wasPressed = false
local holdTicks = 0
local panelEnabled = false

local buttonLayout = {
	{ label = "-", left = 2, top = 2, width = 9, height = 9, step = -1 },
	{ label = "+", left = 13, top = 2, width = 9, height = 9, step = 1 },
	{ label = "P", left = 24, top = 2, width = 9, height = 9, step = 0 },
}

local function clampValue(value, lowest, highest)
	if value < lowest then
		return lowest
	elseif value > highest then
		return highest
	end
	return value
end

local function insideButton(touchX, touchY, button)
	return touchX >= button.left and touchY >= button.top
		and touchX < button.left + button.width and touchY < button.top + button.height
end

local function rememberMeasurement(measured)
	table.insert(measuredHistory, measured)
	while #measuredHistory > historyLength do
		table.remove(measuredHistory, 1)
	end
end

local function averageMeasurement()
	if #measuredHistory == 0 then
		return 0
	end
	local runningTotal = 0
	for _, sample in ipairs(measuredHistory) do
		runningTotal = runningTotal + sample
	end
	return runningTotal / #measuredHistory
end

local function formatReading(reading)
	local rounded = math.floor(reading * 10 + 0.5) / 10
	return string.format("%.1f", rounded)
end

local function pressButton(button)
	if button.step == 0 then
		panelEnabled = not panelEnabled
	else
		targetValue = clampValue(targetValue + button.step, -50, 150)
	end
end

function onTick()
	screenWidth = input.getNumber(1)
	screenHeight = input.getNumber(2)
	local touchX = input.getNumber(3)
	local touchY = input.getNumber(4)
	local isPressed = input.getBool(1)
	local measured = input.getNumber(7)

	rememberMeasurement(measured)

	if isPressed then
		holdTicks = holdTicks + 1
	else
		holdTicks = 0
	end

	-- A tap acts once; holding repeats every eight ticks after a short delay
	local repeating = holdTicks > 20 and holdTicks % 8 == 0
	if isPressed and (not wasPressed or repeating) then
		for _, button in ipairs(buttonLayout) do
			if insideButton(touchX, touchY, button) then
				pressButton(button)
			end
		end
	end
	wasPressed = isPressed

	local smoothed = averageMeasurement()
	local controlError = targetValue - smoothed
	local controlOutput = 0
	if panelEnabled then
		controlOutput = clampValue(controlError * controlGain, -1, 1)
	end

	output.setNumber(1, controlOutput)
	output.setNumber(2, targetValue)
	output.setNumber(3, smoothed)
	output.setBool(1, panelEnabled)
	output.setBool(2, math.abs(controlError) < 0.5)
end

local function drawButton(button)
	if button.step == 0 and panelEnabled then
		screen.setColor(40, 160, 60)
	else
		screen.setColor(70, 70, 70)
	end
	screen.drawRectF(button.left, button.top, button.width, button.height)
	screen.setColor(255, 255, 255)
	screen.drawText(button.left + 3, button.top + 2, button.label)
end

local function drawHistory(left, top, width, height)
	screen.setColor(30, 30, 30)
	screen.drawRectF(left, top, width, height)
	if #measuredHistory < 2 then
		return
	end
	local lowest, highest = math.huge, -math.huge
	for _, sample in ipairs(measuredHistory) do
		lowest = math.min(lowest, sample, targetValue)
		highest = math.max(highest, sample, targetValue)
	end
	local span = math.max(highest - lowest, 1)
	local function plotY(value)
		return top + height - 1 - (value - lowest) / span * (height - 1)
	end
	screen.setColor(200, 120, 0)
	screen.drawLine(left, plotY(targetValue), left + width, plotY(targetValue))
	screen.setColor(0, 180, 255)
	for index = 2, #measuredHistory do
		local fromX = left + (index - 2) / (historyLength - 1) * width
		local toX = left + (index - 1) / (historyLength - 1) * width
		screen.drawLine(fromX, plotY(measuredHistory[index - 1]), toX, plotY(measuredHistory[index]))
	end
end

function onDraw()
	local width = screen.getWidth()
	local height = screen.getHeight()
	screen.setColor(0, 0, 0)
	screen.drawClear()

	for _, button in ipairs(buttonLayout) do
		drawButton(button)
	end

	screen.setColor(255, 255, 255)
	screen.drawText(2, 14, "SET " .. formatReading(targetValue))
	screen.drawText(2, 21, "NOW " .. formatReading(averageMeasurement()))
	drawHistory(2, 28, width - 4, height - 30)
end

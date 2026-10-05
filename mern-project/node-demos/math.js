export function add(firstNumber, secondNumber) {
  return firstNumber + secondNumber;
}

export function subtract(firstNumber, secondNumber) {
  return firstNumber - secondNumber;
}

export function multiply(firstNumber, secondNumber) {
  return firstNumber * secondNumber;
}

export function divide(firstNumber, secondNumber) {
  if (secondNumber === 0) {
    throw new Error('Division by zero is not allowed');
  }

  return firstNumber / secondNumber;
}

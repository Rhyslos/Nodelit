// open tasks first, then completed ones (each in their saved order); the board shows and drops tasks in this order
export function orderListTasks(tasks) {
    const byOrder = (a, b) => a.taskOrder - b.taskOrder;

    return [
        ...tasks.filter(task => !task.isCompleted).sort(byOrder),
        ...tasks.filter(task => task.isCompleted).sort(byOrder)
    ];
}

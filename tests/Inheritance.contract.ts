import { Contract } from "../assembly/index";

class Parent extends Contract {
    get(): u32 {
        return 1;
    }
}

export class Child extends Parent {}
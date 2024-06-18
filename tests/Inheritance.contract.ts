import { Contract, entrypoint } from "../assembly/index";

class Parent extends Contract {
    get(): u32 {
        return 1;
    }
}

@entrypoint
export class Child extends Parent {}
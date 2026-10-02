import { writeFileSync } from 'node:fs';
import { testIdentity } from './release-report-adapters.mjs';
export default class ReleaseReporter {
  onTestRunStart() {
    if (!process.env.FLOW_VITEST_RECEIPT) throw new Error('FLOW_VITEST_RECEIPT required');
    this.receipt={runId:process.env.FLOW_RELEASE_RUN_ID,candidate:process.env.FLOW_RELEASE_CANDIDATE,complete:false,results:[],errors:[]};
    this.save();
  }
  save(){writeFileSync(process.env.FLOW_VITEST_RECEIPT,JSON.stringify(this.receipt,null,2));}
  onTestRunEnd(modules,errors,reason){
    this.receipt.errors=errors.map(error=>error.message??String(error));
    for(const module of modules){
      const visit=task=>{if(task.type==='suite'&&task.result?.errors?.length)this.receipt.errors.push(...task.result.errors.map(error=>error.message??String(error)));for(const child of task.tasks??[])visit(child);};visit(module.task);
      for(const test of module.children.allTests()){
        const diagnostic=test.diagnostic();
        this.receipt.results.push({id:testIdentity(module.moduleId,test.fullName),status:test.result().state==='passed'?'passed':test.result().state,retry:diagnostic?.retryCount,repeat:diagnostic?.repeatCount});
      }
    }
    this.receipt.complete=reason==='passed'||reason==='failed';
    this.receipt.reason=reason;this.save();
  }
}

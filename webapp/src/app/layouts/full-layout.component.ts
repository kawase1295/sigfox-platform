import {Component, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {Alert, Category, Connector, Dashboard, Device, FireLoopRef, Message, Organization, Parser, Role, User} from '../shared/sdk/models';
import {Subscription} from 'rxjs/Subscription';
import {OrganizationApi, ParserApi, UserApi} from '../shared/sdk/services/custom';
import {RealTime} from '../shared/sdk/services/core';

@Component({
  templateUrl: './full-layout.component.html'
})
export class FullLayoutComponent implements OnInit, OnDestroy {

  @ViewChild('addOrEditOrganizationModal') addOrEditOrganizationModal: any;

  // Flags
  private isInitialized = false;
  public devicesReady = false;
  public messagesReady = false;
  public countCategoriesReady = false;
  public countDevicesReady = false;
  public countMessagesReady = false;
  public countAlertsReady = false;
  public countParsersReady = false;
  public countConnectorsReady = false;
  public countOrganizationsReady = false;

  private user: User;
  private selectedUsers: Array<Object> = [];
  private selectUsers: Array<Object> = [];
  public organization: Organization;

  public addOrganizationFlag = true;
  private organizationToAddOrEdit: Organization = new Organization();
  private organizations: Organization[] = [];

  private subscriptions: Subscription[] = [];

  private organizationRouteSub: Subscription;
  private userOrganizationSub: Subscription;
  private dashboardSub: Subscription;
  private categorySub: Subscription;
  private deviceSub: Subscription;
  private messageSub: Subscription;
  private alertSub: Subscription;
  private parserSub: Subscription;
  private connectorSub: Subscription;

  private dashboards: Dashboard[] = [];

  private countCategories = 0;
  private countDevices = 0;
  private countMessages = 0;
  private countAlerts = 0;
  private countParsers = 0;
  private countConnectors = 0;
  private countOrganizationUsers = 0;

  private userRef: FireLoopRef<User>;
  private organizationRef: FireLoopRef<Organization>;
  private userOrganizationRef: FireLoopRef<Organization>;
  private dashboardRef: FireLoopRef<Dashboard>;
  private categoryRef: FireLoopRef<Category>;
  private deviceRef: FireLoopRef<Device>;
  private messageRef: FireLoopRef<Message>;
  private alertRef: FireLoopRef<Alert>;
  private parserRef: FireLoopRef<Parser>;
  private connectorRef: FireLoopRef<Connector>;

  private admin = false;

  public disabled = false;
  public status: { isopen: boolean } = {isopen: false};

  private selectUsersSettings = {
    singleSelection: false,
    text: 'Select users',
    selectAllText: 'Select all',
    unSelectAllText: 'Unselect all',
    enableSearchFilter: true,
    classes: 'select-organization'
  };

  constructor(private rt: RealTime,
              private userApi: UserApi,
              private parserApi: ParserApi,
              private organizationApi: OrganizationApi,
              private route: ActivatedRoute,
              private router: Router) {

    this.router.routeReuseStrategy.shouldReuseRoute = function () {
      return false;
    };
  }

  redirectToUserView(): void {
    this.router.navigate(['/' + this.route.snapshot.firstChild.routeConfig.path]);
  }

  redirectToOgranizationView(orgId: string): void {
    if (
      this.route.snapshot.firstChild.routeConfig.path === 'categories'
      || this.route.snapshot.firstChild.routeConfig.path === 'devices'
      || this.route.snapshot.firstChild.routeConfig.path === 'messages') {
      /*this.router.navigate(['/'], {skipLocationChange: true}).then(() => {
        this.router.navigate(['organization/' + orgId + '/' + this.route.snapshot.firstChild.routeConfig.path]);
      });*/
      this.router.navigate(['organization/' + orgId + '/' + this.route.snapshot.firstChild.routeConfig.path]);
    } else {
      /*this.router.navigate(['/'], {skipLocationChange: true}).then(() => {
        this.router.navigate(['/organization/' + orgId]);
      });*/
      this.router.navigate(['organization/' + orgId]);
    }

    /*this.organizationApi.findById(orgId, {include: 'Members'}).subscribe((organization: Organization) => {
      this.organization = organization;
      this.setup();
    });*/
  }


  ngOnInit(): void {
    console.log('Full Layout: ngOnInit');
    // Get the logged in User object
    this.user = this.userApi.getCachedCurrent();
    this.userApi.getRoles(this.user.id).subscribe((roles: Role[]) => {
      this.user.roles = roles;
      roles.forEach((role: Role) => {
        if (role.name === 'admin') {
          this.admin = true;
          return;
        }
      });
    });

    // Check if organization view
    this.subscriptions.push(this.route.params.subscribe(params => {

      this.isInitialized = false;

      console.log('params full layout', params);
      if (params.id) {
        this.organizationApi.findById(params.id, {include: 'Members'}).subscribe((organization: Organization) => {
          this.organization = organization;
          // console.log('Organization:', organization);
          // Real Time
          if (
            this.rt.connection.isConnected() &&
            this.rt.connection.authenticated
          ) {
            this.rt.onReady().subscribe(() => this.setup());
          } else {
            this.rt.onAuthenticated().subscribe(() => this.setup());
            this.rt.onReady().subscribe(() => this.setup());
          }
        });
      } else {

        //Check if real time and setup
        // Real Time
        if (
          this.rt.connection.isConnected() &&
          this.rt.connection.authenticated
        ) {
          this.rt.onReady().subscribe(() => this.setup());
        } else {
          this.rt.onAuthenticated().subscribe(() => this.setup());
          this.rt.onReady().subscribe( () => this.setup());
        }
      }
      //console.log('Router', params);
    }));
  }

  setup(): void {
    if (!this.isInitialized) {
      this.isInitialized = true;
      console.log('Setup Full layout');
      this.cleanSetup();

      // For organizations menu
      this.userRef = this.rt.FireLoop.ref<User>(User).make(this.user);
      this.userOrganizationRef = this.userRef.child<Organization>('Organizations');
      this.subscriptions.push(this.userOrganizationRef.on('change', {include: 'Members'}).subscribe((organizations: Organization[]) => {
        this.organizations = organizations;
        this.countOrganizationsReady = true;
        console.log(organizations);
      }));

      if (this.organization) {

        this.organizationRef = this.rt.FireLoop.ref<Organization>(Organization).make(this.organization);

        // Dashboards
        this.dashboardRef = this.organizationRef.child<Dashboard>('Dashboards');
        this.subscriptions.push(this.dashboardRef.on('change').subscribe((dashboards: Dashboard[]) => {
          this.dashboards = dashboards;
        }));

        /**
         * Count real time methods below
         */
        // Categories
        this.organizationApi.countCategories(this.organization.id).subscribe(result => {
          this.countCategories = result.count;
          this.countCategoriesReady = true;
        });
        this.categoryRef = this.organizationRef.child<Category>('Categories');
        this.subscriptions.push(this.categoryRef.on('child_added', {limit: 1}).subscribe((categories: Category[]) => {
          this.organizationApi.countCategories(this.organization.id).subscribe(result => {
            this.countCategories = result.count;
          });
        }));

        // Devices
        this.organizationApi.countDevices(this.organization.id).subscribe(result => {
          this.countDevices = result.count;
          this.countDevicesReady = true;
        });
        this.deviceRef = this.organizationRef.child<Device>('Devices');
        this.deviceSub = this.deviceRef.on('child_added', {limit: 1}).subscribe((devices: Device[]) => {
          this.organizationApi.countDevices(this.organization.id).subscribe(result => {
            this.countDevices = result.count;
          });
        });

        // Messages
        this.organizationApi.countMessages(this.organization.id).subscribe(result => {
          this.countMessages = result.count;
          this.countMessagesReady = true;
        });
        this.messageRef = this.organizationRef.child<Message>('Messages');
        this.messageSub = this.messageRef.on('child_added', {limit: 1}).subscribe((messages: Message[]) => {
          this.organizationApi.countMessages(this.organization.id).subscribe(result => {
            this.countMessages = result.count;
          });
        });

      } else {

        this.dashboardRef = this.userRef.child<Dashboard>('Dashboards');
        this.subscriptions.push(this.dashboardRef.on('change').subscribe((dashboards: Dashboard[]) => {
          this.dashboards = dashboards;
        }));

        /**
         * Count real time methods below
         */
        // Categories
        this.userApi.countCategories(this.user.id).subscribe(result => {
          this.countCategories = result.count;
          this.countCategoriesReady = true;
        });
        this.categoryRef = this.userRef.child<Category>('Categories');
        this.subscriptions.push(this.categoryRef.on('child_added', {limit: 1}).subscribe((categories: Category[]) => {
          this.userApi.countCategories(this.user.id).subscribe(result => {
            this.countCategories = result.count;
          });
        }));

        // Devices
        this.userApi.countDevices(this.user.id).subscribe(result => {
          this.countDevices = result.count;
          this.countDevicesReady = true;
        });
        this.deviceRef = this.rt.FireLoop.ref<Device>(Device);
        this.deviceSub = this.deviceRef.on('child_added',
          {
            limit: 1,
            where: {userId: this.user.id}
          }).subscribe((devices: Device[]) => {
          if (devices.length > 0) {
            this.userApi.countDevices(this.user.id).subscribe(result => {
              this.countDevices = result.count;
            });
          }
        });

        // Messages
        this.userApi.countMessages(this.user.id).subscribe(result => {
          this.countMessages = result.count;
          this.countMessagesReady = true;
        });
        this.messageRef = this.rt.FireLoop.ref<Message>(Message);
        this.messageSub = this.messageRef.on('child_added', {
          limit: 1,
          where: {userId: this.user.id}
        }).subscribe((messages: Message[]) => {
          this.userApi.countMessages(this.user.id).subscribe(result => {
            this.countMessages = result.count;
          });
        });

        // Alerts
        this.userApi.countAlerts(this.user.id).subscribe(result => {
          this.countAlerts = result.count;
          this.countAlertsReady = true;
        });
        this.alertRef = this.userRef.child<Alert>('Alerts');
        this.subscriptions.push(this.alertRef.on('child_added', {limit: 1}).subscribe((alerts: Alert[]) => {
          this.userApi.countAlerts(this.user.id).subscribe(result => {
            this.countAlerts = result.count;
          });
        }));

        // Parsers
        this.parserApi.count().subscribe(result => {
          this.countParsers = result.count;
          this.countParsersReady = true;
        });
        this.parserRef = this.rt.FireLoop.ref<Parser>(Parser);
        this.subscriptions.push(this.parserRef.on('child_added', {limit: 1}).subscribe((parsers: Parser[]) => {
          this.parserApi.count().subscribe(result => {
            this.countParsers = result.count;
          });
        }));

        // Connectors
        this.userApi.countConnectors(this.user.id).subscribe(result => {
          this.countConnectors = result.count;
        });
        this.connectorRef = this.userRef.child<Connector>('Connectors');
        this.subscriptions.push(this.connectorRef.on('child_added', {limit: 1}).subscribe((connectors: Connector[]) => {
          this.userApi.countConnectors(this.user.id).subscribe(result => {
            this.countConnectors = result.count;
            this.countConnectorsReady = true;
          });
        }));
      }
    }
  }

  ngOnDestroy(): void {
    console.log('Full Layout: ngOnDestroy');
    this.cleanSetup();
  }

  private cleanSetup() {
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
    if (this.organizationRef) this.organizationRef.dispose();
    if (this.userOrganizationRef) this.userOrganizationRef.dispose();
    if (this.userRef) this.userRef.dispose();
    if (this.dashboardRef) this.dashboardRef.dispose();
    if (this.categoryRef) this.categoryRef.dispose();
    if (this.deviceRef) this.deviceRef.dispose();
    if (this.messageRef) this.messageRef.dispose();
    if (this.alertRef) this.alertRef.dispose();
    if (this.parserRef) this.parserRef.dispose();
    if (this.connectorRef) this.connectorRef.dispose();
  }

  public toggled(open: boolean): void {
    console.log('Dropdown is now: ', open);
  }

  public toggleDropdown($event: MouseEvent): void {
    $event.preventDefault();
    $event.stopPropagation();
    this.status.isopen = !this.status.isopen;
  }

  onLogout(): void {
    this.ngOnDestroy();
    this.rt.connection.disconnect();
    this.userApi.logout().subscribe((result: any) => {
      console.log('is authenticated: ', this.userApi.isAuthenticated());
      // Some actions on logout
      this.router.navigate(['/login']);
    }, (error: any) => {
      console.log(error);
      this.router.navigate(['/login']);
    });
  }

  newDashboard(): void {
    const dashboard: Dashboard = new Dashboard();
    dashboard.name = 'New dashboard';

    if (this.organization) {
      dashboard.name = 'Shared dashboard';
    }

    this.dashboardRef.create(dashboard).subscribe(dashboard => {
      if (!this.organization) {
        this.router.navigate(['/dashboard/' + dashboard.id]);
      } else {
        this.router.navigate(['/organization/' + this.organization.id + '/dashboard/' + dashboard.id]);
      }
    });
  }

  openAddOrganizationModal(): void {
    this.selectedUsers = [];
    this.selectUsers = [];
    this.addOrganizationFlag = true;
    this.organizationToAddOrEdit = new Organization();
    const myself = {
      id: this.user.id,
      itemName: this.user.email
    };
    this.selectedUsers.push(myself);

    if (this.admin) {
      this.userApi.find({fields: {email: true, id: true}}).subscribe((results: User[]) => {
        //console.log(results);
        results.forEach((result: any) => {
          const item = {
            id: result.id,
            itemName: result.email
          };
          this.selectUsers.push(item);
        });

      });
    }
    this.addOrEditOrganizationModal.show();
  }

  openEditOrganizationModal(): void {
    this.selectedUsers = [];
    this.selectUsers = [];
    this.addOrganizationFlag = false;
    this.organizationToAddOrEdit = this.organization;
    this.organizationToAddOrEdit.Members.forEach(member => {
      const user = {
        id: member.id,
        itemName: member.email
      };
      this.selectedUsers.push(user);
    });

    if (this.admin) {
      this.userApi.find({fields: {email: true, id: true}}).subscribe((results: User[]) => {
        //console.log(results);
        results.forEach((result: any) => {
          const item = {
            id: result.id,
            itemName: result.email
          };
          this.selectUsers.push(item);
        });

      });
    }
    this.addOrEditOrganizationModal.show();
  }

  addOrganization(): void {

    this.organizationToAddOrEdit.userId = this.user.id;

    this.userOrganizationRef.create(this.organizationToAddOrEdit).subscribe((organization: Organization) => {
      console.log('Organization created', organization);

      this.selectedUsers.forEach((user: any, index: number) => {
        this.organizationApi.linkMembers(organization.id, user.id).subscribe((result) => {
          console.log('result after linking member: ', result);
          /*if (index === this.selectedUsers.length - 1) {
            this.userApi.getOrganizations(this.user.id, {include: ['Members']}).subscribe((organizations: Organization[]) => {
              console.log(organizations);
              this.organizations = organizations;
              this.addOrEditOrganizationtModal.hide();
            });
          }*/
          this.addOrEditOrganizationModal.hide();
        });
      });
    });
  }

  editOrganization(): void {
    this.userOrganizationRef.upsert(this.organizationToAddOrEdit).subscribe((organization: Organization) => {
      console.log('Organization created', organization);

      this.selectedUsers.forEach((user: any, index, array) => {
        this.organizationApi.linkMembers(organization.id, user.id).subscribe((result) => {
          console.log('result after linking member: ', result);
          if (index === array.length - 1) {
            this.userApi.getOrganizations(this.user.id, {include: ['Members']}).subscribe((organizations: Organization[]) => {
              console.log(organizations);
              this.organizations = organizations;
              this.addOrEditOrganizationModal.hide();
            });
          }
        });
      });
    });
  }

  unlinkMember(organization: any, user: any): void {
    this.organizationApi.unlinkMembers(organization.id, user.id).subscribe((result) => {
      console.log('Result after unlinking member: ', result);
    });
  }

  // setAdminView():void {
  //   localStorage.setItem('adminView', 'true');
  //   this.setup();
  // }

}
